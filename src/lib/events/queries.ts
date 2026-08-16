import type { MantineColor } from "@mantine/core";
import type { DateTimeStringValue } from "@mantine/schedule";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { calendars, users } from "@/db/schema";
import { getGoogleIntegration } from "@/lib/google";
import { formatInstantToNaive, monthRange, utcToDateString } from "@/lib/events/datetime";
import { parseEventType } from "@/lib/events/notes";

export interface CalendarEventPayload {
  calendarId: string;
  googleEventId: string;
  allDay: boolean;
  eventType: string | null;
  calendarName: string;
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

/** Fetch events for a month across the selected calendars, as schedule-ready data. */
export async function fetchMonthEvents(params: {
  month: string;
  calendarIds: string[];
  typeFilter: string[];
}): Promise<CalendarEvent[]> {
  if (params.calendarIds.length === 0) {
    return [];
  }

  const rows = await db
    .select()
    .from(calendars)
    .where(inArray(calendars.id, params.calendarIds));

  const integration = await getGoogleIntegration();
  const { start, end } = monthRange(params.month);
  const events: CalendarEvent[] = [];

  for (const calendar of rows) {
    const items = await integration.listEvents(calendar.googleCalendarId, start, end);
    for (const item of items) {
      const eventType = parseEventType(item.description);
      if (params.typeFilter.length > 0 && (!eventType || !params.typeFilter.includes(eventType))) {
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
        },
      });
    }
  }

  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return events;
}
