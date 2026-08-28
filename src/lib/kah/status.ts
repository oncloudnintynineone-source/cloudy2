/**
 * Shared KAH status reads. The notify path (`notify.ts`) and the user-facing
 * "My KAH status" page both need the same plumbing: the enabled groups with
 * their active members, and the set of members tagged as "away" on internal
 * events overlapping a window. This module is (almost) pure at the edges —
 * `kahStatusForWindow` is a pure mapping over the group/busy inputs and is
 * unit-tested here without a DB; the I/O helpers route every calendar read
 * through the sanctioned month cache (never raw `listEvents`).
 */

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { calendars, kahGroupMembers, kahGroups, users } from "@/db/schema";
import { formatInstantToNaive, monthsInRange } from "@/lib/events/datetime";
import { parseEventPeople } from "@/lib/events/notes";
import { getCachedMonthEventsForCalendars } from "@/lib/google/eventsCache";
import { inCountryPercentage, type KahGroupCheck } from "@/lib/kah/check";

/** Live per-group KAH status over a window: both safe and breached groups. */
export interface KahGroupStatus {
  groupId: string;
  name: string;
  requiredPct: number;
  /** Floored in-country % over the window. */
  actualPct: number;
  totalMembers: number;
  /** Member ids tagged as away on overlapping internal events. */
  awayIds: string[];
  /** True when the group is below its threshold (consistent with the notify math). */
  breached: boolean;
}

/**
 * Per-group in-country status for the given window, in input order — the
 * same floored percentage and "strictly below" breach rule as
 * `computeKahBreaches`, but reported for every group so a status page can
 * show safe groups too. Empty groups report 100% and never breach.
 */
export function kahStatusForWindow(
  groups: KahGroupCheck[],
  busyUserIds: ReadonlySet<string>,
): KahGroupStatus[] {
  return groups.map((group) => {
    const memberIds = [...new Set(group.memberIds)];
    const awayIds = memberIds.filter((id) => busyUserIds.has(id));
    const actualPct = inCountryPercentage(memberIds.length, awayIds.length);
    return {
      groupId: group.id,
      name: group.name,
      requiredPct: group.minPercentage,
      actualPct,
      totalMembers: memberIds.length,
      awayIds,
      breached: memberIds.length > 0 && actualPct < group.minPercentage,
    };
  });
}

/**
 * Every group as the check sees it: each group with only the members still
 * active on the roster. Deactivated users stop counting against the
 * percentage even when still listed as members.
 */
export async function listKahGroupChecks(): Promise<KahGroupCheck[]> {
  const [groupRows, memberRows] = await Promise.all([
    db
      .select({
        id: kahGroups.id,
        name: kahGroups.name,
        minPercentage: kahGroups.minPercentage,
      })
      .from(kahGroups),
    db
      .select({ groupId: kahGroupMembers.groupId, userId: users.id })
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
 * The groups a user belongs to, with active members resolved the same way as
 * `listKahGroupChecks` (only the subset the user is in).
 */
export async function kahGroupsForUser(userId: string): Promise<KahGroupCheck[]> {
  const all = await listKahGroupChecks();
  const userGroupRows = await db
    .select({ groupId: kahGroupMembers.groupId })
    .from(kahGroupMembers)
    .where(eq(kahGroupMembers.userId, userId));
  const userGroupIds = new Set(userGroupRows.map((row) => row.groupId));
  return all.filter((group) => userGroupIds.has(group.id));
}

/** Whether a user is listed as a member of at least one KAH group. */
export async function userHasKahGroup(userId: string): Promise<boolean> {
  const rows = await db
    .select({ groupId: kahGroupMembers.groupId })
    .from(kahGroupMembers)
    .where(eq(kahGroupMembers.userId, userId))
    .limit(1);
  return rows.length > 0;
}

/**
 * KAH members tagged on internal events overlapping [windowStart, windowEnd]:
 * every calendar is month-read through the events cache (never raw
 * `listEvents`), and each item's creator/invitees join the set.
 */
export async function busyKahsIn(windowStart: Date, windowEnd: Date): Promise<Set<string>> {
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

/** Display names for a set of user ids (unknown ids dropped from the result). */
export async function resolveUserNames(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds)];
  const map = new Map<string, string>();
  if (uniqueIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, uniqueIds));
  for (const row of rows) {
    map.set(row.id, row.name);
  }
  return map;
}
