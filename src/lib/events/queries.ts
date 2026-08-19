import type { MantineColor } from "@mantine/core";
import type { DateTimeStringValue } from "@mantine/schedule";
import { eq, inArray } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { calendars, users } from "@/db/schema";
import { mapWithConcurrency } from "@/lib/async";
import { formatInstantToNaive, shiftMonth, utcToDateString } from "@/lib/events/datetime";
import { getCachedMonthEvents } from "@/lib/google/eventsCache";
import { onlyUuidIds } from "@/lib/uuid";
import {
  isExternalEvent,
  parseEventEndAmPm,
  parseEventPeople,
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

const PALETTE: MantineColor[] = [
  "blue",
  "green",
  "red",
  "violet",
  "orange",
  "cyan",
  "grape",
  "teal",
  "yellow",
  "pink",
];

function colorForCalendar(calendarId: string): MantineColor {
  let hash = 0;
  for (let i = 0; i < calendarId.length; i += 1) {
    hash = (hash * 31 + calendarId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function scheduleTime(date: Date, allDay: boolean): string {
  return allDay ? `${utcToDateString(date)} 00:00:00` : formatInstantToNaive(date);
}

/** All calendars (the filter option source), ordered by name. */
export async function listCalendars() {
  return db.select().from(calendars).orderBy(calendars.name);
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

/** Max Google `events.list` calls in flight per page render (bounded for quota). */
const GOOGLE_FETCH_CONCURRENCY = 4;

/** Warm the neighboring months' cache entries after the response ships. */
const PREFETCH_ADJACENT_MONTHS = true;

/** Fetch events for a month across the selected calendars, as schedule-ready data. */
export async function fetchMonthEvents(params: {
  month: string;
  calendarIds: string[];
  typeFilter: string[];
  /** Keep only events created by or tagged on one of these users (empty = no filter). */
  userFilter: string[];
}): Promise<CalendarEvent[]> {
  if (params.calendarIds.length === 0) {
    return [];
  }

  // Name order makes the representative copy (first per group id) deterministic.
  const rows = await db
    .select()
    .from(calendars)
    .where(inArray(calendars.id, params.calendarIds))
    .orderBy(calendars.name);

  // Prefetch the adjacent months' cache entries after the response is sent, so
  // navigating to a neighboring month renders from the cache instead of hitting
  // Google. Cache hits are free; misses warm the entry for later.
  if (PREFETCH_ADJACENT_MONTHS) {
    const prevMonth = shiftMonth(params.month, -1);
    const nextMonth = shiftMonth(params.month, 1);
    after(() => {
      for (const calendar of rows) {
        void getCachedMonthEvents(calendar.googleCalendarId, prevMonth).catch(() => {});
        void getCachedMonthEvents(calendar.googleCalendarId, nextMonth).catch(() => {});
      }
    });
  }

  // Google month reads go through the Postgres event cache (keyed per
  // calendar+month). Fetch concurrently with a bounded concurrency, then
  // flatten in row order so the deterministic representative-copy selection is
  // preserved.
  const itemsByCalendar = await mapWithConcurrency(rows, GOOGLE_FETCH_CONCURRENCY, (calendar) =>
    getCachedMonthEvents(calendar.googleCalendarId, params.month),
  );

  const events: CalendarEvent[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const calendar = rows[i];
    for (const item of itemsByCalendar[i]) {
      const eventType = parseEventType(item.description);
      if (params.typeFilter.length > 0 && (!eventType || !params.typeFilter.includes(eventType))) {
        continue;
      }
      const people = parseEventPeople(item.description);
      if (
        params.userFilter.length > 0 &&
        !eventMatchesUserFilter(
          { creatorId: people.creatorId, inviteeUserIds: people.userIds },
          params.userFilter,
        )
      ) {
        continue;
      }
      events.push({
        id: `${calendar.id}:${item.id}`,
        title: item.title || "(no title)",
        start: scheduleTime(item.start, item.allDay),
        end: scheduleTime(item.end, item.allDay),
        color: colorForCalendar(calendar.id),
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
          external: isExternalEvent(item.description),
        },
      });
    }
  }

  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  // A logical event has at most one copy per filtered department calendar;
  // collapse the copies so views show it once (stable sort keeps calendar
  // name order among equal start times, so the representative is deterministic).
  return dedupeEventsByGroupId(events);
}
