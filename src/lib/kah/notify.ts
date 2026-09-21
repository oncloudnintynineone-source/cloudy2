/**
 * Fire-and-forget KAH breach detection after an event create/update. Reads
 * the groups and the events overlapping the saved event's window through the
 * sanctioned month-cache reads, computes the breaches with the pure check,
 * then hands the email + audit write to `after()` so the server action's
 * response is never delayed. Everything is best-effort: any failure is logged
 * and swallowed — a KAH problem never fails the mutation.
 *
 * Dedup: each (group × window × breach-pct) combination triggers at most one
 * email. If a subsequent mutation produces the same breach state for the same
 * window, the notification is suppressed. A change in breach percentage
 * (worsening or recovery + re-breach) re-notifies.
 */

import { after } from "next/server";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { kahBreachNotifications, settings, users } from "@/db/schema";
import { AUDIT_ACTIONS } from "@/lib/audit/build";
import { logAction } from "@/lib/audit/log";
import { sendNotificationEmail } from "@/lib/email/send";
import { computeKahBreaches } from "@/lib/kah/check";
import { buildKahBreachEmail, formatKahWindow, type KahBreachEmailGroup } from "@/lib/kah/email";
import { busyKahsIn, listKahGroupChecks } from "@/lib/kah/status";

export interface KahBreachActor {
  actorId: string | null;
  actorName: string | null;
  actorRole: string;
}

export interface KahBreachCheckInput {
  /** Absolute instant range of the saved event (the checked window). */
  windowStart: Date;
  windowEnd: Date;
  /** True when the event occupies whole/half days (all-day exclusive-end window). */
  allDay: boolean;
  /** The rendered Google Calendar title of the saved event. */
  eventTitle: string;
  /** The acting user, for the audit row and the email body. */
  actor: KahBreachActor;
}

/** Away-member display names per breached group (unknown ids dropped). */
async function resolveAwayNames(
  breaches: ReturnType<typeof computeKahBreaches>,
): Promise<Map<string, string[]>> {
  const allAwayIds = [...new Set(breaches.flatMap((breach) => breach.awayIds))];
  if (allAwayIds.length === 0) {
    return new Map(breaches.map((breach) => [breach.groupId, []]));
  }
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, allAwayIds));
  const nameById = new Map(rows.map((user) => [user.id, user.name]));
  return new Map(
    breaches.map((breach) => [
      breach.groupId,
      breach.awayIds.map((id) => nameById.get(id)).filter((name): name is string => !!name),
    ]),
  );
}

/**
 * Resolve email addresses for a set of user IDs. Returns deduplicated,
 * non-empty emails only.
 */
async function resolveMemberEmails(userIds: string[]): Promise<string[]> {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(inArray(users.id, uniqueIds));
  const emails = new Set<string>();
  for (const row of rows) {
    if (row.email && row.email.trim()) {
      emails.add(row.email.trim());
    }
  }
  return [...emails];
}

/**
 * Run the breach check for one successful event mutation. The month fetches,
 * email, and audit write run inside `after()`. Never throws.
 */
export function dispatchKahBreachCheck(input: KahBreachCheckInput): void {
  after(async () => {
    try {
      const groups = await listKahGroupChecks();
      if (groups.length === 0) {
        return;
      }

      const busy = await busyKahsIn(input.windowStart, input.windowEnd);
      const breaches = computeKahBreaches(groups, busy);
      if (breaches.length === 0) {
        return;
      }

      // Dedup: skip breaches already notified for this group × window × pct.
      const groupIds = [...new Set(breaches.map((b) => b.groupId))];
      const existingRows = await db
        .select({
          groupId: kahBreachNotifications.groupId,
          breachPct: kahBreachNotifications.breachPct,
        })
        .from(kahBreachNotifications)
        .where(
          and(
            eq(kahBreachNotifications.windowStart, input.windowStart),
            eq(kahBreachNotifications.windowEnd, input.windowEnd),
            inArray(kahBreachNotifications.groupId, groupIds),
          ),
        );
      const notifiedKeys = new Set(
        existingRows.map((r) => `${r.groupId}:${r.breachPct}`),
      );
      const newBreaches = breaches.filter(
        (b) => !notifiedKeys.has(`${b.groupId}:${b.actualPct}`),
      );
      if (newBreaches.length === 0) {
        return;
      }

      const awayNamesByGroup = await resolveAwayNames(newBreaches);

      // Collect all member IDs from breached groups and resolve their emails.
      const breachedMemberIds = newBreaches.flatMap((breach) => {
        const group = groups.find((g) => g.id === breach.groupId);
        return group?.memberIds ?? [];
      });
      const recipients = await resolveMemberEmails(breachedMemberIds);

      // Read email templates from settings.
      const [settingsRow] = await db
        .select({
          kahEmailSubjectTemplate: settings.kahEmailSubjectTemplate,
          kahEmailBodyTemplate: settings.kahEmailBodyTemplate,
        })
        .from(settings)
        .limit(1);

      const window = formatKahWindow(input.windowStart, input.windowEnd, input.allDay);

      // Audit first so the breach is on record even when sending fails.
      await logAction({
        actorId: input.actor.actorId,
        actorName: input.actor.actorName,
        actorRole: input.actor.actorRole,
        action: AUDIT_ACTIONS.kahBreachNotify,
        entityType: "kah_group",
        entityName: newBreaches.map((breach) => breach.groupName).join(", "),
        method: "dispatchKahBreachCheck",
        details: {
          eventTitle: input.eventTitle.trim() || null,
          window,
          breaches: newBreaches
            .map((breach) => `${breach.groupName}: ${breach.actualPct}% < ${breach.requiredPct}%`)
            .join("; "),
          notified: recipients.length > 0 ? recipients.join(", ") : null,
        },
      });

      // Record dedup rows before sending so a concurrent check sees them.
      await db.insert(kahBreachNotifications).values(
        newBreaches.map((b) => ({
          groupId: b.groupId,
          windowStart: input.windowStart,
          windowEnd: input.windowEnd,
          breachPct: b.actualPct,
        })),
      );

      if (recipients.length === 0) {
        return;
      }

      const email = buildKahBreachEmail({
        breaches: newBreaches.map<KahBreachEmailGroup>((breach) => ({
          groupName: breach.groupName,
          requiredPct: breach.requiredPct,
          actualPct: breach.actualPct,
          totalMembers: breach.totalMembers,
          awayNames: awayNamesByGroup.get(breach.groupId) ?? [],
        })),
        eventTitle: input.eventTitle,
        actorName: input.actor.actorName,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        allDay: input.allDay,
        subjectTemplate: settingsRow?.kahEmailSubjectTemplate ?? null,
        bodyTemplate: settingsRow?.kahEmailBodyTemplate ?? null,
      });
      if (!email) {
        return;
      }
      await sendNotificationEmail({
        to: recipients,
        subject: email.subject,
        body: email.body,
      });
    } catch (error) {
      console.error("[kah] Breach check failed", error);
    }
  });
}
