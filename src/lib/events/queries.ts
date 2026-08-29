import type { MantineColor } from "@mantine/core";
import type { DateTimeStringValue } from "@mantine/schedule";
import { eq, inArray } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { calendars, eventTypes, users } from "@/db/schema";
import { effectiveCalendarColor, effectiveEventTypeColor } from "@/lib/events/eventColors";
import { formatInstantToNaive, shiftMonth, utcToDateString } from "@/lib/events/datetime";
import { getCachedMonthEventsForCalendars } from "@/lib/google/eventsCache";
import type { GcalEventItem } from "@/lib/google/types";
import { onlyUuidIds } from "@/lib/uuid";
import {
  isExternalEvent,
  parseEventEndAmPm,
  parseEventOutOfCamp,
  parseEventOverseas,
  parseEventPeople,
  parseEventPinned,
  parseEventStartAmPm,
  parseEventTimeOption,
  parseEventTitle,
  parseEventType,
} from "@/lib/events/notes";
import type { TimeOption } from "@/lib/events/timeOptions";
import { dedupeEventsByGroupId } from "@/lib/events/targets";
import { eventMatchesUserFilter } from "@/lib/events/userFilter";

export interface CalendarEventPayload {
  calendarId: string;
  googleEventId: string;
  allDay: boolean;
  eventType: string | null;
  calendarName: string;
  /** Group id shared by all department copies of the logical event, or null (legacy). */
  eventId: string | null;
  /** Id of the user who created the event (from the notes block), or null. */
  creatorId: string | null;
  /** Ids of users tagged on the event (schedule view rows). */
  inviteeUserIds: string[];
  /** Department (calendar) ids tagged on the event (schedule view rows). */
  inviteeDepartmentIds: string[];
  /** Raw (pre-template) description from the notes block; null for legacy events. */
  rawTitle: string | null;
  /** Datetime option used to create the event; defaults to the timed "range". */
  timeOption: TimeOption;
  /** Start half-of-day indicator for "full" events, else null. */
  startAmPm: "AM" | "PM" | null;
  /** End half-of-day indicator for "full" events, else null. */
  endAmPm: "AM" | "PM" | null;
  /** True when the event takes place out of camp (from the notes block). */
  outOfCamp: boolean;
  /** True when the out-of-camp event is outside the country (from the notes block). */
  overseas: boolean;
  /** True when the event is explicitly marked as pinned (Pinned Events panel). */
  pinned: boolean;
  /** The event's location (from Google); "" when unset. */
  location: string;
  /** True when the event was created directly in Google Calendar, not in the app. */
  external: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: DateTimeStringValue;
  end: DateTimeStringValue;
  color: MantineColor;
  payload: CalendarEventPayload;
}

function scheduleTime(date: Date, allDay: boolean): string {
  return allDay ? `${utcToDateString(date)} 00:00:00` : formatInstantToNaive(date);
}

/** All calendars (the filter option source), ordered for display (sortOrder then name). */
export async function listCalendars() {
  return db.select().from(calendars).orderBy(calendars.sortOrder, calendars.name);
}

/** The department calendar a user is assigned to, or null. */
export async function getUserDepartmentId(userId: string): Promise<string | null> {
  const [user] = await db
    .select({ departmentId: users.departmentId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.departmentId ?? null;
}

/** Department calendar per user id (null when unassigned or unknown). */
export async function getUserDepartmentIds(
  userIds: string[],
): Promise<Record<string, string | null>> {
  const uniqueIds = [...new Set(onlyUuidIds(userIds))];
  if (uniqueIds.length === 0) {
    return {};
  }
  const rows = await db
    .select({ id: users.id, departmentId: users.departmentId })
    .from(users)
    .where(inArray(users.id, uniqueIds));
  return Object.fromEntries(rows.map((row) => [row.id, row.departmentId]));
}

/** Warm the neighboring months' cache entries after the response ships. */
const PREFETCH_ADJACENT_MONTHS = true;

/**
 * One Google listing item as schedule-ready data, or null when the type/user
 * filters exclude it.
 *
 * Color: typed events use their event type's pinned color, or the
 * deterministic default derived from the type name (also the fallback for
 * types deleted after their events were created); untyped/external events
 * use the department calendar's pinned color, or its id-derived default.
 */
function mapCalendarItem(
  calendar: { id: string; name: string; color: string | null },
  item: GcalEventItem,
  filters: { typeFilter: string[]; userFilter: string[] },
  typeColors: Map<string, string | null>,
): CalendarEvent | null {
  const eventType = parseEventType(item.description);
  if (filters.typeFilter.length > 0 && (!eventType || !filters.typeFilter.includes(eventType))) {
    return null;
  }
  const people = parseEventPeople(item.description);
  if (
    filters.userFilter.length > 0 &&
    !eventMatchesUserFilter(
      { creatorId: people.creatorId, inviteeUserIds: people.userIds },
      filters.userFilter,
    )
  ) {
    return null;
  }
  return {
    id: `${calendar.id}:${item.id}`,
    title: item.title || "(no title)",
    start: scheduleTime(item.start, item.allDay),
    end: scheduleTime(item.end, item.allDay),
    color: eventType
      ? effectiveEventTypeColor(eventType, typeColors.get(eventType) ?? null)
      : effectiveCalendarColor(calendar.id, calendar.color),
    payload: {
      calendarId: calendar.id,
      googleEventId: item.id,
      allDay: item.allDay,
      eventType,
      calendarName: calendar.name,
      eventId: people.eventId,
      creatorId: people.creatorId,
      inviteeUserIds: people.userIds,
      inviteeDepartmentIds: people.departmentIds,
      rawTitle: parseEventTitle(item.description),
      timeOption: parseEventTimeOption(item.description) ?? (item.allDay ? "full" : "range"),
      startAmPm: parseEventStartAmPm(item.description),
      endAmPm: parseEventEndAmPm(item.description),
      outOfCamp: parseEventOutOfCamp(item.description),
      overseas: parseEventOverseas(item.description),
      pinned: parseEventPinned(item.description),
      location: item.location ?? "",
      external: isExternalEvent(item.description),
    },
  };
}

/**
 * Fetch events across several months (a week spanning a boundary needs two)
 * for the selected calendars, as schedule-ready data.
 *
 * Google month reads go through the layered events cache (L1 memory + one
 * batched Postgres read per month), one pass per month. Because Google month
 * listings overlap at boundaries (a multi-day event appears in both), items
 * are deduped by (calendar, google event id) before mapping. Results are
 * flattened in calendar display order (sortOrder then name, months in
 * chronological order) so the deterministic representative-copy selection is
 * preserved.
 */
export async function fetchRangeEvents(params: {
  months: string[];
  calendarIds: string[];
  typeFilter: string[];
  /** Keep only events created by or tagged on one of these users (empty = no filter). */
  userFilter: string[];
  /** Bypass the events cache and block on fresh Google fetches (force refresh). */
  force?: boolean;
}): Promise<CalendarEvent[]> {
  const months = [...new Set(params.months)].sort();
  if (params.calendarIds.length === 0 || months.length === 0) {
    return [];
  }

  // sortOrder then name makes the representative copy (first per group id) deterministic
  // and respects the admin-configured department order.
  const rows = await db
    .select()
    .from(calendars)
    .where(inArray(calendars.id, params.calendarIds))
    .orderBy(calendars.sortOrder, calendars.name);
  const googleCalendarIds = rows.map((calendar) => calendar.googleCalendarId);

  // Event type name → pinned color (tiny table; read per request so a color
  // change takes effect on the next render with no cache invalidation).
  const typeRows = await db
    .select({ name: eventTypes.name, color: eventTypes.color })
    .from(eventTypes);
  const typeColors = new Map(typeRows.map((row) => [row.name, row.color]));

  const seen = new Set<string>();
  const events: CalendarEvent[] = [];
  let allServed = true;
  // Fetch the months in parallel; the flatten order below stays chronological
  // (month-major, calendar display order within each month) so the deterministic
  // representative-copy selection is preserved.
  const cachedPerMonth = await Promise.all(
    months.map((month) =>
      getCachedMonthEventsForCalendars(googleCalendarIds, month, {
        force: params.force === true,
      }),
    ),
  );
  for (let i = 0; i < months.length; i++) {
    const cached = cachedPerMonth[i];
    allServed &&= cached.allServed;
    for (const calendar of rows) {
      for (const item of cached.events[calendar.googleCalendarId] ?? []) {
        const key = `${calendar.id}:${item.id}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const mapped = mapCalendarItem(calendar, item, params, typeColors);
        if (mapped) {
          events.push(mapped);
        }
      }
    }
  }

  // Prefetch the months adjacent to the whole range only when this view
  // missed the cache (i.e. the user is actually navigating), so
  // fully-cached views don't churn extra Google/DB work after the response
  // ships.
  if (PREFETCH_ADJACENT_MONTHS && !allServed) {
    const beforeRange = shiftMonth(months[0], -1);
    const afterRange = shiftMonth(months[months.length - 1], 1);
    after(() => {
      void getCachedMonthEventsForCalendars(googleCalendarIds, beforeRange).catch(() => {});
      void getCachedMonthEventsForCalendars(googleCalendarIds, afterRange).catch(() => {});
    });
  }

  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  // A logical event has at most one copy per filtered department calendar;
  // collapse the copies so views show it once (stable sort keeps calendar
  // display order among equal start times, so the representative is deterministic).
  return dedupeEventsByGroupId(events);
}

/** Fetch events for a month across the selected calendars, as schedule-ready data. */
export async function fetchMonthEvents(params: {
  month: string;
  calendarIds: string[];
  typeFilter: string[];
  userFilter: string[];
  force?: boolean;
}): Promise<CalendarEvent[]> {
  const { month, ...rest } = params;
  return fetchRangeEvents({ months: [month], ...rest });
}
