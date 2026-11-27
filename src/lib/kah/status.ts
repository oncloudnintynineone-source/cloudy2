/**
 * Shared KAH status reads. The notify path (`notify.ts`) and the user-facing
 * "My KAH status" page both need the same plumbing: the enabled groups with
 * their active members, and the set of members tagged as "away" on internal
 * events overlapping a window. This module is (almost) pure at the edges —
 * `kahStatusForWindow` is a pure mapping over the group/busy inputs and is
 * unit-tested here without a DB; the I/O helpers route every calendar read
 * through the sanctioned month cache (never raw `listEvents`).
 */

import type { MantineColor } from "@mantine/core";
import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { calendars, kahGroupMembers, kahGroups, users } from "@/db/schema";
import { listEventTypes } from "@/lib/eventTypes/queries";
import { effectiveEventWindow } from "@/lib/events/clashes";
import { conflictWindowNaive } from "@/lib/events/clashDisplay";
import {
  addOneDay,
  formatInstantToNaive,
  monthsInRange,
  parseNaiveToInstant,
} from "@/lib/events/datetime";
import { effectiveCalendarColor, effectiveEventTypeColor } from "@/lib/events/eventColors";
import { normalizeOriginalStartTime } from "@/lib/events/occurrence";
import {
  isExternalEvent,
  parseEventEndAmPm,
  parseEventOutOfCamp,
  parseEventOverseas,
  parseEventPeople,
  parseEventStartAmPm,
  parseEventTimeOption,
  parseEventTitle,
  parseEventType,
} from "@/lib/events/notes";
import type { TimeOption } from "@/lib/events/timeOptions";
import { getCachedMonthEventsForCalendarsMulti } from "@/lib/google/eventsCache";
import { inCountryPercentage, type KahGroupCheck } from "@/lib/kah/check";
import { isUuid } from "@/lib/uuid";

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
 * Every group as the check sees it (name order): each group with only the
 * members still active on the roster. Deactivated users stop counting against
 * the percentage even when still listed as members.
 */
export async function listKahGroupChecks(): Promise<KahGroupCheck[]> {
  const [groupRows, memberRows] = await Promise.all([
    db
      .select({
        id: kahGroups.id,
        name: kahGroups.name,
        minPercentage: kahGroups.minPercentage,
      })
      .from(kahGroups)
      .orderBy(asc(kahGroups.name)),
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
 * The ids of every KAH group a user is listed in (active membership only, the
 * same membership rows the checks read). Non-UUID identities belong to none.
 */
export async function kahGroupIdsForUser(userId: string): Promise<Set<string>> {
  if (!isUuid(userId)) {
    return new Set();
  }
  const rows = await db
    .select({ groupId: kahGroupMembers.groupId })
    .from(kahGroupMembers)
    .where(eq(kahGroupMembers.userId, userId));
  return new Set(rows.map((row) => row.groupId));
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
 * An overseas event with the display/geometry fields the KAH breach cards need
 * to render an event row — the same shape family as the clash reports'
 * `EventClashEntry`, so the shared `ClashEventRow` renders both. Produced only
 * by `overseasEventEntriesInRange` (the page read); the notify path keeps the
 * lean `KahOverseasEvent`.
 */
export interface KahBreachEvent extends KahOverseasEvent {
  /** Registry (department) calendar id this copy was read from. */
  calendarId: string;
  /** Department name of `calendarId`, for display. */
  calendarName: string;
  /** Google event id of this copy. */
  googleEventId: string;
  /** Logical group id shared by all department copies, or null (legacy/external). */
  eventId: string | null;
  /** Google parent id when this copy is an instance of a recurring series. */
  recurringEventId?: string | null;
  /** Normalised original slot of that instance (date for all-day, naive SGT otherwise). */
  originalStartTime?: string | null;
  /** The stored Google Calendar summary. */
  title: string;
  /** Event type name from the notes block, or null (untyped/external). */
  typeName: string | null;
  /** Event type shortname (acronym), or null when unset/unknown. */
  typeShortname: string | null;
  /** The raw (pre-template) title from the notes block; null for legacy/external. */
  rawTitle: string | null;
  /** Display color: the event type's color, else the department fallback. */
  color: MantineColor;
  /** True when the event was created directly in Google (no app notes). */
  external: boolean;
  /** Whether the event is stored as all-day (display only). */
  allDay: boolean;
  /** Datetime option used to create the event ("range" | "full" | "half"). */
  timeOption: TimeOption;
  /** Start half-of-day indicator for "half" events, else null. */
  startAmPm: "AM" | "PM" | null;
  /** End half-of-day indicator for "half" events, else null. */
  endAmPm: "AM" | "PM" | null;
  /** Inclusive display window (all-day end stepped back to its civil day). */
  startNaive: string;
  endNaive: string;
  /** Half-day-aware occupancy window the cards label by. */
  effectiveStartNaive: string;
  effectiveEndNaive: string;
  /** True when the event occupies whole days (`timeOption: "full"`). */
  occupiesFullDay: boolean;
}

/**
 * Overseas events (the only kind that takes a member "away" — out of country)
 * overlapping [windowStart, windowEnd), enriched with the display/geometry
 * fields the breach cards need. Every calendar is month-read through the events
 * cache (never raw `listEvents`), matching the view reads; month listings
 * overlap at boundaries, so items are deduped by (calendar, event id). In-camp,
 * local out-of-camp, external, and legacy events never appear.
 */
export async function overseasEventEntriesInRange(
  windowStart: Date,
  windowEnd: Date,
): Promise<KahBreachEvent[]> {
  const calendarRows = await db
    .select({
      id: calendars.id,
      googleCalendarId: calendars.googleCalendarId,
      name: calendars.name,
      color: calendars.color,
    })
    .from(calendars);
  const googleCalendarIds = calendarRows.map((row) => row.googleCalendarId);
  if (googleCalendarIds.length === 0) {
    return [];
  }
  const calendarByGoogleId = new Map(calendarRows.map((row) => [row.googleCalendarId, row]));

  // Event types resolve each item's shortname/color for the type-first label.
  const allEventTypes = await listEventTypes();
  const typeByName = new Map(allEventTypes.map((eventType) => [eventType.name, eventType]));

  // Wall-clock month keys covering the window, matching the view reads.
  const months = windowMonths(windowStart, windowEnd);

  const seen = new Set<string>();
  const events: KahBreachEvent[] = [];
  // One batched multi-month read (one metadata round trip for every month)
  // rather than one read per month — same payloads, fewer round trips on the
  // path the nav badge runs on every shell mount (docs/neon-usage.md).
  const cached = await getCachedMonthEventsForCalendarsMulti(googleCalendarIds, months);
  for (const month of months) {
    for (const [googleCalendarId, items] of Object.entries(cached.events[month] ?? {})) {
      const calendar = calendarByGoogleId.get(googleCalendarId);
      if (!calendar) {
        continue;
      }
      for (const item of items) {
        // Only overseas events take a tagged member out of the country.
        if (!eventTakesMembersOverseas(item.description)) {
          continue;
        }
        const timeOption =
          parseEventTimeOption(item.description) ?? (item.allDay ? "full" : "range");
        const startAmPm = parseEventStartAmPm(item.description);
        const endAmPm = parseEventEndAmPm(item.description);
        // The event's real occupancy on the UTC+8 wall clock: all-day events
        // are stored at UTC midnight (Google's date convention) and half-day
        // events carry AM/PM markers in the notes, so day windows must be
        // realigned exactly like the clash engine (`effectiveEventWindow`) —
        // otherwise a one-day event spills 8 h into the next UTC+8 day.
        const occupancy = effectiveEventWindow({
          timeOption,
          startAmPm,
          endAmPm,
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
        const typeName = parseEventType(item.description);
        const typeInfo = typeName ? typeByName.get(typeName) : undefined;
        const { startNaive, endNaive } = conflictWindowNaive(item.start, item.end, item.allDay);
        events.push({
          start: occupancy.start,
          end: occupancy.end,
          creatorId: people.creatorId,
          userIds: people.userIds,
          calendarId: calendar.id,
          calendarName: calendar.name,
          googleEventId: item.id,
          eventId: people.eventId,
          recurringEventId: item.recurringEventId ?? null,
          originalStartTime: item.originalStartTime
            ? normalizeOriginalStartTime(item.originalStartTime, item.allDay)
            : null,
          title: item.title || "(no title)",
          typeName,
          typeShortname: typeInfo?.shortname ?? null,
          rawTitle: parseEventTitle(item.description),
          color: typeName
            ? effectiveEventTypeColor(typeName, typeInfo?.color ?? null)
            : effectiveCalendarColor(calendar.id, calendar.color),
          external: isExternalEvent(item.description),
          allDay: item.allDay,
          timeOption,
          startAmPm,
          endAmPm,
          startNaive,
          endNaive,
          effectiveStartNaive: formatInstantToNaive(occupancy.start),
          effectiveEndNaive: formatInstantToNaive(occupancy.end),
          occupiesFullDay: timeOption === "full",
        });
      }
    }
  }
  return events;
}

/**
 * Lean overseas events (no display fields) for the away-set reads — the notify
 * path and the page's per-day scan both consume this shape. Delegates to
 * `overseasEventEntriesInRange` and drops the extra fields.
 */
export async function overseasEventsInRange(
  windowStart: Date,
  windowEnd: Date,
): Promise<KahOverseasEvent[]> {
  const entries = await overseasEventEntriesInRange(windowStart, windowEnd);
  return entries.map(({ start, end, creatorId, userIds }) => ({
    start,
    end,
    creatorId,
    userIds,
  }));
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
  /** First day that hit `worstPct` (ties keep the earliest day). */
  worstDate: string;
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
    let worstDate = "";
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
        worstDate,
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
          worstDate = entry.date;
          away = new Set(entry.status.awayIds);
        } else {
          if (entry.status.actualPct < worstPct) {
            // Strict improvement only — ties keep the earliest worst day.
            worstPct = entry.status.actualPct;
            worstDate = entry.date;
          }
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

/**
 * Collapse cross-calendar copies of one occurrence into a single representative.
 * A repeating series' different occurrences stay distinct (they share the group
 * id but not `originalStartTime`); events without a group id (external/legacy)
 * are deduped by (calendar, Google id). Pure.
 */
export function dedupeOverseasEventsByGroupId<
  T extends {
    eventId: string | null;
    calendarId: string;
    googleEventId: string;
    recurringEventId?: string | null;
    originalStartTime?: string | null;
  },
>(events: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const event of events) {
    const base = event.eventId ?? `${event.calendarId}:${event.googleEventId}`;
    const key =
      event.eventId && (event.recurringEventId || event.originalStartTime)
        ? `${base}:${event.originalStartTime ?? event.googleEventId}`
        : base;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(event);
  }
  return result;
}

/** The members of `memberIds` tagged as attendees on the event (its away subset). Pure. */
export function memberIdsAwayOnEvent(
  event: Pick<KahOverseasEvent, "userIds">,
  memberIds: ReadonlySet<string>,
): string[] {
  return [...new Set(event.userIds)].filter((id) => memberIds.has(id));
}

/**
 * The overseas events that took a group's members away during a breach episode:
 * events overlapping the half-open [startInstant, endInstant) window whose
 * tagged attendees intersect the group's active members. Pure (drives the
 * breach cards' event lists).
 */
export function eventsForGroupEpisode<
  T extends Pick<KahOverseasEvent, "start" | "end" | "userIds">,
>(events: readonly T[], memberIds: ReadonlySet<string>, startInstant: Date, endInstant: Date): T[] {
  return events.filter(
    (event) =>
      event.start < endInstant &&
      event.end > startInstant &&
      event.userIds.some((id) => memberIds.has(id)),
  );
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
