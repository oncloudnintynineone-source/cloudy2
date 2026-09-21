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
import { effectiveEventWindow } from "@/lib/events/clashes";
import { addOneDay, formatInstantToNaive, monthsInRange, parseNaiveToInstant } from "@/lib/events/datetime";
import {
  parseEventEndAmPm,
  parseEventOutOfCamp,
  parseEventOverseas,
  parseEventPeople,
  parseEventStartAmPm,
  parseEventTimeOption,
} from "@/lib/events/notes";
import { getCachedMonthEventsForCalendars } from "@/lib/google/eventsCache";
import { inCountryPercentage, type KahGroupCheck } from "@/lib/kah/check";

/**
 * Whether the id is a real roster-user UUID. Session identities are not always
 * roster rows — the bootstrap admin password signs in as the synthetic
 * `id: "admin"` (`auth.ts` authorize), and a uuid-typed column query (e.g.
 * `kah_group_members.user_id`) would fail Postgres's cast on such an id.
 * Pure so it can be unit-tested without a database.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

/**
 * Whether an event's notes mark it as taking its tagged people out of the
 * country — the KAH "away" rule. Only events marked overseas count: in-camp
 * and out-of-camp-but-in-country events keep everyone in country, and legacy
 * events without the overseas flag never count as away. Overseas implies out
 * of camp (the flag is only ever written alongside it), so both are checked.
 * Pure so it can be unit-tested without a database.
 */
export function eventTakesMembersOverseas(description: string): boolean {
  return parseEventOutOfCamp(description) && parseEventOverseas(description);
}

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
  // Non-UUID identities (the synthetic bootstrap admin) are not roster rows,
  // hence belong to no KAH group — skip the uuid-typed query entirely.
  if (!isUuid(userId)) {
    return [];
  }
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
  // Non-UUID identities (the synthetic bootstrap admin) are not roster rows —
  // skip the uuid-typed query entirely (this runs on every protected render).
  if (!isUuid(userId)) {
    return false;
  }
  const rows = await db
    .select({ groupId: kahGroupMembers.groupId })
    .from(kahGroupMembers)
    .where(eq(kahGroupMembers.userId, userId))
    .limit(1);
  return rows.length > 0;
}

/**
 * The `YYYY-MM` month keys whose listings can contain an event overlapping the
 * half-open [windowStart, windowEnd) instant window. The end is exclusive, so
 * a window ending exactly on a month boundary does not pull in the following
 * month: an event only listed there would span the boundary and therefore also
 * overlap the previous month's listing. Pure so it can be unit-tested without
 * a database.
 */
export function windowMonths(windowStart: Date, windowEnd: Date): string[] {
  const naiveStart = formatInstantToNaive(windowStart);
  // Last instant covered by the half-open window.
  const naiveEnd = formatInstantToNaive(new Date(windowEnd.getTime() - 1));
  return [...new Set(monthsInRange(naiveStart, naiveEnd))];
}

/** An overseas event (in-app, taking its tagged people out of country) as the KAH reads see it. */
export interface KahOverseasEvent {
  /**
   * Start of the event's *effective* occupancy — its SGT-aligned window (via
   * `effectiveEventWindow`: all-day UTC-midnight bounds realigned to the UTC+8
   * civil day, half-day AM/PM honored), matching the clash engine so a
   * one-day all-day event covers exactly one UTC+8 day.
   */
  start: Date;
  /** Exclusive end of the effective occupancy window. */
  end: Date;
  /** Id of the organizer who created the event (from the notes block), or null. */
  creatorId: string | null;
  /** Ids of tagged attendees (the organizer is away only when among them). */
  userIds: string[];
}

/**
 * Overseas events (the only kind that takes a member "away" — out of country)
 * overlapping [windowStart, windowEnd). Every calendar is month-read through
 * the events cache (never raw `listEvents`), matching the view reads; month
 * listings overlap at boundaries, so items are deduped by (calendar, event id).
 * In-camp, local out-of-camp, external, and legacy events never appear.
 */
export async function overseasEventsInRange(
  windowStart: Date,
  windowEnd: Date,
): Promise<KahOverseasEvent[]> {
  const calendarRows = await db
    .select({ googleCalendarId: calendars.googleCalendarId })
    .from(calendars);
  const googleCalendarIds = calendarRows.map((row) => row.googleCalendarId);
  if (googleCalendarIds.length === 0) {
    return [];
  }

  // Wall-clock month keys covering the window, matching the view reads.
  const months = windowMonths(windowStart, windowEnd);

  const seen = new Set<string>();
  const events: KahOverseasEvent[] = [];
  const cachedPerMonth = await Promise.all(
    months.map((month) => getCachedMonthEventsForCalendars(googleCalendarIds, month)),
  );
  for (const cached of cachedPerMonth) {
    for (const [googleCalendarId, items] of Object.entries(cached.events)) {
      for (const item of items) {
        // Only overseas events take a tagged member out of the country.
        if (!eventTakesMembersOverseas(item.description)) {
          continue;
        }
        // The event's real occupancy on the UTC+8 wall clock: all-day events
        // are stored at UTC midnight (Google's date convention) and half-day
        // events carry AM/PM markers in the notes, so day windows must be
        // realigned exactly like the clash engine (`effectiveEventWindow`) —
        // otherwise a one-day event spills 8 h into the next UTC+8 day.
        const occupancy = effectiveEventWindow({
          timeOption: parseEventTimeOption(item.description) ?? (item.allDay ? "full" : "range"),
          startAmPm: parseEventStartAmPm(item.description),
          endAmPm: parseEventEndAmPm(item.description),
          allDay: item.allDay,
          start: item.start,
          end: item.end,
        });
        // Half-open [start, end): back-to-back windows do not overlap.
        if (occupancy.start >= windowEnd || occupancy.end <= windowStart) {
          continue;
        }
        const key = `${googleCalendarId}:${item.id}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const people = parseEventPeople(item.description);
        events.push({
          start: occupancy.start,
          end: occupancy.end,
          creatorId: people.creatorId,
          userIds: people.userIds,
        });
      }
    }
  }
  return events;
}

/**
 * KAH members taken "away" (out of country) by overseas events overlapping
 * [windowStart, windowEnd): the tagged attendees of each overseas event join
 * the set — the organizer counts only when they tagged themselves (or the
 * event type hides invitees, which keeps the organizer as the sole attendee).
 * Only events marked overseas make a member away; in-camp and local out-of-camp
 * events never do.
 */
export async function busyKahsIn(windowStart: Date, windowEnd: Date): Promise<Set<string>> {
  const events = await overseasEventsInRange(windowStart, windowEnd);
  const busy = new Set<string>();
  for (const event of events) {
    for (const userId of event.userIds) {
      busy.add(userId);
    }
  }
  return busy;
}

/** The away set of one scanned day (`YYYY-MM-DD`). */
export interface KahDayBusy {
  date: string;
  /** Member ids tagged on overseas events overlapping the day. */
  awayIds: string[];
}

/**
 * Per-day away sets over a list of `YYYY-MM-DD` days (UTC+8 day windows, the
 * same half-open `[day 00:00, next-day 00:00)` the single-day status check
 * uses, so the scan and the notify path never diverge on which days count).
 * Events are expected to carry their *effective* occupancy (SGT-aligned,
 * realigned in `overseasEventsInRange`), so an all-day event on Aug 10 covers
 * Aug 10 only and never bleeds 8 h into Aug 11. Pure so it is unit-tested
 * without a database.
 */
export function busyDaysInRange(events: KahOverseasEvent[], days: string[]): KahDayBusy[] {
  return days.map((date) => {
    const dayStart = parseNaiveToInstant(`${date} 00:00:00`);
    const dayEnd = parseNaiveToInstant(`${addOneDay(date)} 00:00:00`);
    const away = new Set<string>();
    for (const event of events) {
      // Half-open [event.start, event.end) vs [dayStart, dayEnd).
      if (event.start >= dayEnd || event.end <= dayStart) {
        continue;
      }
      for (const userId of event.userIds) {
        away.add(userId);
      }
    }
    return { date, awayIds: [...away] };
  });
}

/** One scanned day's per-group status, aligned with the day list. */
export interface KahDayStatus {
  date: string;
  /** `kahStatusForWindow` output for the day (one entry per group, input order). */
  statuses: KahGroupStatus[];
}

/** One maximal run of consecutive breached days for a group. */
export interface KahBreachEpisode {
  groupId: string;
  groupName: string;
  requiredPct: number;
  /** First breached day of the run (`YYYY-MM-DD`). */
  startDate: string;
  /** Last breached day of the run (`YYYY-MM-DD`). */
  endDate: string;
  /** Consecutive breached days in the run. */
  days: number;
  /** Lowest floored in-country % during the run. */
  worstPct: number;
  /** The run touches the scanned window's start (it may extend further back). */
  clippedStart: boolean;
  /** The run touches the scanned window's end (it may extend further ahead). */
  clippedEnd: boolean;
  /** Resolved: ended before today; active: includes today; upcoming: starts after today. */
  status: "active" | "upcoming" | "resolved";
  /** Union of the group's away members across the run's days. */
  awayIds: string[];
}

/**
 * Maximal runs of consecutive breached days per group, from a day-aligned
 * status scan — the past/future breach history the status page shows.
 * `perDay` must cover a contiguous window; runs touching the first/last day
 * are flagged as clipped (they may extend beyond the scanned window).
 * Classification is against `today` (the real current UTC+8 date): a run
 * that ended before today is resolved, one starting after today is upcoming,
 * and one including today is active. Result order: active, then upcoming
 * (each oldest first), then resolved (newest first). Pure so it is
 * unit-tested without a database.
 */
export function kahBreachEpisodes(perDay: KahDayStatus[], today: string): KahBreachEpisode[] {
  if (perDay.length === 0) {
    return [];
  }
  const windowStart = perDay[0].date;
  const windowEnd = perDay[perDay.length - 1].date;

  // Collect each group's per-day entries in day order (statuses keep group order).
  const byGroup = new Map<string, { date: string; status: KahGroupStatus }[]>();
  for (const day of perDay) {
    for (const status of day.statuses) {
      const entries = byGroup.get(status.groupId) ?? [];
      entries.push({ date: day.date, status });
      byGroup.set(status.groupId, entries);
    }
  }

  const episodes: KahBreachEpisode[] = [];
  for (const [groupId, entries] of byGroup) {
    const identity = entries[0].status;
    let runStart: number | null = null;
    let worstPct = 0;
    let away = new Set<string>();
    const closeRun = (endIndex: number) => {
      const start = entries[runStart as number];
      const end = entries[endIndex];
      episodes.push({
        groupId,
        groupName: identity.name,
        requiredPct: identity.requiredPct,
        startDate: start.date,
        endDate: end.date,
        days: endIndex - (runStart as number) + 1,
        worstPct,
        clippedStart: start.date === windowStart,
        clippedEnd: end.date === windowEnd,
        status: end.date < today ? "resolved" : start.date > today ? "upcoming" : "active",
        awayIds: [...away],
      });
    };
    entries.forEach((entry, i) => {
      if (entry.status.breached) {
        if (runStart === null) {
          runStart = i;
          worstPct = entry.status.actualPct;
          away = new Set(entry.status.awayIds);
        } else {
          worstPct = Math.min(worstPct, entry.status.actualPct);
          for (const id of entry.status.awayIds) {
            away.add(id);
          }
        }
      } else if (runStart !== null) {
        closeRun(i - 1);
        runStart = null;
      }
    });
    if (runStart !== null) {
      closeRun(entries.length - 1);
    }
  }

  const rank: Record<KahBreachEpisode["status"], number> = {
    active: 0,
    upcoming: 1,
    resolved: 2,
  };
  return episodes.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) {
      return rank[a.status] - rank[b.status];
    }
    if (a.startDate !== b.startDate) {
      // History reads newest-first; active/upcoming read oldest-first.
      return a.status === "resolved"
        ? b.startDate.localeCompare(a.startDate)
        : a.startDate.localeCompare(b.startDate);
    }
    return a.groupName.localeCompare(b.groupName);
  });
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
