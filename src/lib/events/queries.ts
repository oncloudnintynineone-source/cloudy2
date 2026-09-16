import type { MantineColor } from "@mantine/core";
import type { DateTimeStringValue } from "@mantine/schedule";
import { eq, inArray } from "drizzle-orm";
import { after } from "next/server";
import { cache } from "react";

import { db } from "@/db";
import { calendars, users } from "@/db/schema";
import { getCachedValue } from "@/lib/cache";
import { CONFIG_CACHE_KEYS, CONFIG_CACHE_TTL_MS } from "@/lib/configCache";
import { effectiveCalendarColor, effectiveEventTypeColor } from "@/lib/events/eventColors";
import { formatInstantToNaive, shiftMonth, utcToDateString } from "@/lib/events/datetime";
import { listEventTypes } from "@/lib/eventTypes/queries";
import {
  getCachedMonthEventsForCalendars,
  getCachedMonthEventsForCalendarsMulti,
  type MultiMonthEventsResult,
} from "@/lib/google/eventsCache";
import type { GcalEventItem } from "@/lib/google/types";
import { onlyUuidIds } from "@/lib/uuid";
import {
  isExternalEvent,
  parseEventEndAmPm,
  parseEventOutOfCamp,
  parseEventOverseas,
  parseEventOwnerOnlyEdits,
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
  /** Organizer-only modification lock (admins bypass); absence means open to attendees. */
  ownerOnlyEdits: boolean;
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

/**
 * All calendars (the filter option source), ordered for display (sortOrder then
 * name). Wrapped in React's per-request `cache()` so callers that share a render
 * (the dashboard page + `fetchRangeEvents`) hit the DB once, and in a 60s
 * in-memory TTL (`getCachedValue`) so the two server actions of a launch (the
 * active read and the tab preload) don't each re-read it. Admin edits appear
 * within `CONFIG_CACHE_TTL_MS`.
 */
export const listCalendars = cache(() =>
  getCachedValue(CONFIG_CACHE_KEYS.calendars, CONFIG_CACHE_TTL_MS, async () =>
    db.select().from(calendars).orderBy(calendars.sortOrder, calendars.name),
  ),
);

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
export function mapCalendarItem(
  calendar: { id: string; name: string; color: string | null },
  item: GcalEventItem,
  filters: { typeFilter: string[]; userFilter: string[] },
  typeColors: Map<string, string | null>,
  memberships?: ReadonlyMap<string, string[]>,
): CalendarEvent | null {
  const eventType = parseEventType(item.description);
  if (filters.typeFilter.length > 0 && (!eventType || !filters.typeFilter.includes(eventType))) {
    return null;
  }
  const people = parseEventPeople(item.description);
  if (
    filters.userFilter.length > 0 &&
    !eventMatchesUserFilter(
      {
        creatorId: people.creatorId,
        inviteeUserIds: people.userIds,
        inviteeDepartmentIds: people.departmentIds,
      },
      filters.userFilter,
      memberships,
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
      ownerOnlyEdits: parseEventOwnerOnlyEdits(item.description),
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

/** Registry calendar row (the `listCalendars` shape) used by range reads. */
type CalendarRow = Awaited<ReturnType<typeof listCalendars>>[number];

/**
 * The filter-independent result of one cached range read: the calendar rows in
 * display order, the event-type color map, and the raw cached items per
 * (month, Google calendar id). Kept separate from {@link projectRangeEvents} so
 * a single read can back several filter sets (the dashboard tab preload)
 * without re-reading the cache or re-mapping the calendars.
 */
export interface CalendarRangeData {
  /** Registry rows for the requested calendars, in display order. */
  rows: CalendarRow[];
  /** Event type name → pinned color (null = deterministic default). */
  typeColors: Map<string, string | null>;
  /** Raw cached Google items, keyed by month then Google calendar id. */
  cached: MultiMonthEventsResult;
  /** The deduped, sorted months this read covers. */
  months: string[];
}

/**
 * Read a range of months for the selected calendars through the layered events
 * cache (one batched read across all months) and return the raw items plus the
 * shared lookup data. Filtering happens later in {@link projectRangeEvents}, so
 * the same read can serve several filter sets.
 *
 * When the read missed the cache (the user is actually navigating), the months
 * adjacent to the whole range are warmed after the response ships.
 */
export async function readCalendarRange(params: {
  months: string[];
  calendarIds: string[];
  force?: boolean;
}): Promise<CalendarRangeData> {
  const months = [...new Set(params.months)].sort();
  if (params.calendarIds.length === 0 || months.length === 0) {
    return { rows: [], typeColors: new Map(), cached: { events: {}, allServed: true }, months };
  }

  // sortOrder then name makes the representative copy (first per group id) deterministic
  // and respects the admin-configured department order. `listCalendars` and
  // `listEventTypes` are React-`cache()`d per request, so when the calling page
  // has already loaded them this render reuses those results instead of
  // re-querying.
  const allCalendars = await listCalendars();
  const rows = allCalendars.filter((calendar) => params.calendarIds.includes(calendar.id));
  const googleCalendarIds = rows.map((calendar) => calendar.googleCalendarId);

  // Event type name → pinned color (tiny table; read per request so a color
  // change takes effect on the next render with no cache invalidation).
  const allEventTypes = await listEventTypes();
  const typeColors = new Map(allEventTypes.map((row) => [row.name, row.color]));

  // One batched cache read (metadata + full-row SELECTs are shared across
  // months).
  const cached = await getCachedMonthEventsForCalendarsMulti(googleCalendarIds, months, {
    force: params.force === true,
  });

  // Prefetch the months adjacent to the whole range only when this read missed
  // the cache (i.e. the user is actually navigating), so fully-cached views
  // don't churn extra Google/DB work after the response ships.
  if (PREFETCH_ADJACENT_MONTHS && !cached.allServed && params.force !== true) {
    const beforeRange = shiftMonth(months[0], -1);
    const afterRange = shiftMonth(months[months.length - 1], 1);
    after(() => {
      void getCachedMonthEventsForCalendars(googleCalendarIds, beforeRange).catch(() => {});
      void getCachedMonthEventsForCalendars(googleCalendarIds, afterRange).catch(() => {});
    });
  }

  return { rows, typeColors, cached, months };
}

/**
 * Project a {@link CalendarRangeData} into schedule-ready events for one filter
 * set. Rows are iterated in calendar display order (month-major) and items are
 * deduped by (calendar, Google event id) before mapping, so the deterministic
 * representative-copy selection is preserved.
 *
 * `calendarIds`, when given, narrows the projection to a subset of the read's
 * calendars (a tab whose filter selects fewer departments than the shared
 * read), preserving display order.
 *
 * `memberships` (department id → active member user ids) lets the user filter
 * match active members of an event's tagged departments, not just individually
 * tagged attendees.
 */
export function projectRangeEvents(
  data: CalendarRangeData,
  filters: { typeFilter: string[]; userFilter: string[] },
  calendarIds?: string[],
  memberships?: ReadonlyMap<string, string[]>,
): CalendarEvent[] {
  const rows =
    calendarIds === undefined
      ? data.rows
      : data.rows.filter((calendar) => calendarIds.includes(calendar.id));

  const seen = new Set<string>();
  const events: CalendarEvent[] = [];
  for (const month of data.months) {
    for (const calendar of rows) {
      for (const item of data.cached.events[month]?.[calendar.googleCalendarId] ?? []) {
        const key = `${calendar.id}:${item.id}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const mapped = mapCalendarItem(calendar, item, filters, data.typeColors, memberships);
        if (mapped) {
          events.push(mapped);
        }
      }
    }
  }

  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  // A logical event has at most one copy per filtered department calendar;
  // collapse the copies so views show it once (stable sort keeps calendar
  // display order among equal start times, so the representative is deterministic).
  return dedupeEventsByGroupId(events);
}

/**
 * Fetch events across several months (a week spanning a boundary needs two)
 * for the selected calendars, as schedule-ready data. Thin wrapper over
 * {@link readCalendarRange} + {@link projectRangeEvents}.
 */
export async function fetchRangeEvents(params: {
  months: string[];
  calendarIds: string[];
  typeFilter: string[];
  /**
   * Keep only events tagged on one of these users or on a department they are
   * an active member of (empty = no filter). Requires `memberships` for the
   * department-membership part.
   */
  userFilter: string[];
  /** Department id → active member user ids, for the user filter. */
  memberships?: ReadonlyMap<string, string[]>;
  /** Bypass the events cache and block on fresh Google fetches (force refresh). */
  force?: boolean;
}): Promise<CalendarEvent[]> {
  const data = await readCalendarRange(params);
  return projectRangeEvents(
    data,
    {
      typeFilter: params.typeFilter,
      userFilter: params.userFilter,
    },
    undefined,
    params.memberships,
  );
}

/** Fetch events for a month across the selected calendars, as schedule-ready data. */
export async function fetchMonthEvents(params: {
  month: string;
  calendarIds: string[];
  typeFilter: string[];
  userFilter: string[];
  memberships?: ReadonlyMap<string, string[]>;
  force?: boolean;
}): Promise<CalendarEvent[]> {
  const { month, ...rest } = params;
  return fetchRangeEvents({ months: [month], ...rest });
}
