/**
 * Fire-and-forget KAH breach detection after an event create/update. Reads
 * the groups and the events overlapping the saved event's window through the
 * sanctioned month-cache reads, computes the breaches with the pure check,
 * then hands the email + audit write to `after()` so the server action's
 * response is never delayed. Everything is best-effort: any failure is logged
 * and swallowed — a KAH problem never fails the mutation.
 */

import { after } from "next/server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { calendars, kahGroupMembers, kahGroups, settings, users } from "@/db/schema";
import { AUDIT_ACTIONS } from "@/lib/audit/build";
import { logAction } from "@/lib/audit/log";
import { formatInstantToNaive, monthsInRange } from "@/lib/events/datetime";
import { parseEventPeople } from "@/lib/events/notes";
import { getGoogleIntegration } from "@/lib/google";
import { getCachedMonthEventsForCalendars } from "@/lib/google/eventsCache";
import { computeKahBreaches, type KahGroupCheck } from "@/lib/kah/check";
import { buildKahBreachEmail, type KahBreachEmailGroup } from "@/lib/kah/email";
import { getUsersByIds } from "@/lib/roster/queries";

export interface KahBreachActor {
  actorId: string | null;
  actorName: string | null;
  actorRole: string;
}

export interface KahBreachCheckInput {
  /** Absolute instant range of the saved event (the checked window). */
  windowStart: Date;
  windowEnd: Date;
  /** The rendered Google Calendar title of the saved event. */
  eventTitle: string;
  /** The acting user, for the audit row and the email body. */
  actor: KahBreachActor;
}

/**
 * Groups as the check sees them: every group, but only members who are
 * still active on the roster count toward the percentage.
 */
async function listKahGroupChecks(): Promise<KahGroupCheck[]> {
  const [groupRows, memberRows] = await Promise.all([
    db
      .select({
        id: kahGroups.id,
        name: kahGroups.name,
        minPercentage: kahGroups.minPercentage,
      })
      .from(kahGroups),
    db
      .select({ groupId: kahGroupMembers.groupId, userId: kahGroupMembers.userId })
      .from(kahGroupMembers)
      .innerJoin(users, and(eq(users.id, kahGroupMembers.userId), eq(users.status, "active"))),
  ]);
  const byId = new Map<string, KahGroupCheck>(
    groupRows.map((row) => [
      row.id,
      { id: row.id, name: row.name, minPercentage: row.minPercentage, memberIds: [] },
    ]),
  );
  for (const member of memberRows) {
    byId.get(member.groupId)?.memberIds.push(member.userId);
  }
  return [...byId.values()];
}

/**
 * KAH members tagged on internal events overlapping [windowStart, windowEnd]:
 * every calendar is month-read through the events cache (never raw
 * `listEvents`), and each item's creator/invitees join the set.
 */
async function busyKahsIn(windowStart: Date, windowEnd: Date): Promise<Set<string>> {
  const calendarRows = await db
    .select({ googleCalendarId: calendars.googleCalendarId })
    .from(calendars);
  const googleCalendarIds = calendarRows.map((row) => row.googleCalendarId);
  if (googleCalendarIds.length === 0) {
    return new Set();
  }

  // Wall-clock month keys covering the window, matching the view reads.
  const naiveStart = formatInstantToNaive(windowStart);
  const naiveEnd = formatInstantToNaive(windowEnd);
  const months = [...new Set(monthsInRange(naiveStart, naiveEnd))];

  const busy = new Set<string>();
  const cachedPerMonth = await Promise.all(
    months.map((month) => getCachedMonthEventsForCalendars(googleCalendarIds, month)),
  );
  for (const cached of cachedPerMonth) {
    for (const items of Object.values(cached.events)) {
      for (const item of items) {
        if (item.start > windowEnd || item.end < windowStart) {
          continue;
        }
        const people = parseEventPeople(item.description);
        if (people.creatorId) {
          busy.add(people.creatorId);
        }
        for (const userId of people.userIds) {
          busy.add(userId);
        }
      }
    }
  }
  return busy;
}

/** Away-member display names per breached group (unknown ids dropped). */
async function resolveAwayNames(
  breaches: ReturnType<typeof computeKahBreaches>,
): Promise<Map<string, string[]>> {
  const allAwayIds = [...new Set(breaches.flatMap((breach) => breach.awayIds))];
  const nameById = new Map(
    (await getUsersByIds(allAwayIds)).map((user) => [user.id, user.name]),
  );
  return new Map(
    breaches.map((breach) => [
      breach.groupId,
      breach.awayIds.map((id) => nameById.get(id)).filter((name): name is string => !!name),
    ]),
  );
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
      const awayNamesByGroup = await resolveAwayNames(breaches);

      const [settingsRow] = await db
        .select({ kahNotificationEmails: settings.kahNotificationEmails })
        .from(settings)
        .limit(1);
      const recipients = settingsRow?.kahNotificationEmails ?? [];

      const window =
        `${formatInstantToNaive(input.windowStart)} – ${formatInstantToNaive(input.windowEnd)} (UTC+8)`;

      // Audit first so the breach is on record even when sending fails.
      await logAction({
        actorId: input.actor.actorId,
        actorName: input.actor.actorName,
        actorRole: input.actor.actorRole,
        action: AUDIT_ACTIONS.kahBreachNotify,
        entityType: "kah_group",
        entityName: breaches.map((breach) => breach.groupName).join(", "),
        method: "dispatchKahBreachCheck",
        details: {
          eventTitle: input.eventTitle.trim() || null,
          window,
          breaches: breaches
            .map((breach) => `${breach.groupName}: ${breach.actualPct}% < ${breach.requiredPct}%`)
            .join("; "),
          notified: recipients.length > 0 ? recipients.join(", ") : null,
        },
      });

      if (recipients.length === 0) {
        return;
      }

      const email = buildKahBreachEmail({
        breaches: breaches.map<KahBreachEmailGroup>((breach) => ({
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
      });
      if (!email) {
        return;
      }
      const integration = await getGoogleIntegration();
      await integration.sendEmail({
        to: recipients,
        subject: email.subject,
        body: email.body,
      });
    } catch (error) {
      console.error("[kah] Breach check failed", error);
    }
  });
}
