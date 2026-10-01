/**
 * Fire-and-forget KAH breach detection after an event create/update. Reads
 * the groups and the overseas events overlapping the saved event's window
 * through the sanctioned month-cache reads, computes the breaches with the
 * pure check, then hands the email + audit write to `after()` so the server
 * action's response is never delayed. Everything is best-effort: any failure is
 * logged and swallowed — a KAH problem never fails the mutation.
 *
 * The check is *causal*: it is skipped entirely unless the saved event is
 * overseas, and a group is only notified when the saved event tags one of its
 * members. Non-overseas events (and overseas events that take no member away)
 * never affect KAH status, so they never trigger a notification.
 *
 * Dedup: each (group × away-window × breach-pct) combination triggers at most
 * one email. The away window is the union of the overseas events that put the
 * group's members away, so the same underlying absence notifies once no matter
 * which event was saved. Worsening the breach changes the percentage (new key)
 * and re-notifies; recovery followed by a later re-breach yields a different
 * away window and re-notifies too.
 */

import { after } from "next/server";

import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { kahBreachNotifications, settings, users } from "@/db/schema";
import { AUDIT_ACTIONS } from "@/lib/audit/build";
import { logAction } from "@/lib/audit/log";
import { sendNotificationEmail } from "@/lib/email/send";
import { computeKahBreaches } from "@/lib/kah/check";
import { buildKahBreachEmail, formatKahWindow, type KahBreachEmailGroup } from "@/lib/kah/email";
import { listKahGroupChecks, overseasEventsInRange } from "@/lib/kah/status";

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
  /** True when the saved event is overseas (the only kind that can breach KAH). */
  savedEventOverseas: boolean;
  /** Tagged attendees of the saved event (the causal scope of the check). */
  savedEventUserIds: string[];
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

/** The dedup identity of one breach: group × away window × breach percentage. */
function breachKey(breach: ReturnType<typeof computeKahBreaches>[number]): string {
  return [
    breach.groupId,
    breach.awayWindowStart.toISOString(),
    breach.awayWindowEnd.toISOString(),
    breach.actualPct,
  ].join(":");
}

/**
 * Run the breach check for one successful event mutation. The month fetches,
 * email, and audit write run inside `after()`. Never throws.
 */
export function dispatchKahBreachCheck(input: KahBreachCheckInput): void {
  // A non-overseas event takes nobody out of the country, and an event that
  // tags nobody can't change a group — neither can cause a breach.
  if (!input.savedEventOverseas || input.savedEventUserIds.length === 0) {
    return;
  }
  after(async () => {
    try {
      const groups = await listKahGroupChecks();
      if (groups.length === 0) {
        return;
      }

      const events = await overseasEventsInRange(input.windowStart, input.windowEnd);
      const breaches = computeKahBreaches(
        groups,
        events,
        new Set(input.savedEventUserIds),
      );
      if (breaches.length === 0) {
        return;
      }

      // Dedup: skip breaches already notified for this group × away window × pct.
      const groupIds = [...new Set(breaches.map((b) => b.groupId))];
      const existingRows = await db
        .select({
          groupId: kahBreachNotifications.groupId,
          windowStart: kahBreachNotifications.windowStart,
          windowEnd: kahBreachNotifications.windowEnd,
          breachPct: kahBreachNotifications.breachPct,
        })
        .from(kahBreachNotifications)
        .where(inArray(kahBreachNotifications.groupId, groupIds));
      const notifiedKeys = new Set(
        existingRows.map(
          (r) =>
            `${r.groupId}:${r.windowStart.toISOString()}:${r.windowEnd.toISOString()}:${r.breachPct}`,
        ),
      );
      const newBreaches = breaches.filter((b) => !notifiedKeys.has(breachKey(b)));
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
          windowStart: b.awayWindowStart,
          windowEnd: b.awayWindowEnd,
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
