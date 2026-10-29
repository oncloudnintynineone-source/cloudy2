/**
 * Pure day/event helpers shared by the parade-state view and the daily
 * parade-state email, so the two never disagree about which events count for a
 * day or which people an event marks out of camp. Kept free of I/O.
 */

import dayjs from "dayjs";

import type { CalendarEvent } from "@/lib/events/queries";

/** The parade-relevant slice of a `CalendarEvent` for one day. */
export interface ParadeEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  outOfCamp: boolean;
  external: boolean;
  color: CalendarEvent["color"];
  eventType: string | null;
  location: string;
  calendarName: string;
  creatorId: string | null;
  inviteeUserIds: string[];
  inviteeDepartmentIds: string[];
}

/**
 * Active roster user ids per tagged department id. Supplied by the caller
 * (server-side read / the loaded roster) so the pure helpers stay I/O-free.
 */
export type DepartmentMemberships = ReadonlyMap<string, readonly string[]>;

/**
 * True when an event takes place on `date` (`YYYY-MM-DD`). All-day events use
 * Google's exclusive end date, so the last covered day is end − 1; timed events
 * compare their start day.
 */
export function eventCoversDay(event: CalendarEvent, date: string): boolean {
  if (event.payload.allDay) {
    const startDay = event.start.slice(0, 10);
    const endDay = event.end.slice(0, 10);
    const prevDay = dayjs(endDay).subtract(1, "day").format("YYYY-MM-DD");
    return date >= startDay && date <= prevDay;
  }
  return event.start.slice(0, 10) === date;
}

/** Project a `CalendarEvent` down to the fields the parade views render. */
export function toParadeEvent(event: CalendarEvent): ParadeEvent {
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.payload.allDay,
    outOfCamp: event.payload.outOfCamp,
    external: event.payload.external,
    color: event.color,
    eventType: event.payload.eventType,
    location: event.payload.location,
    calendarName: event.payload.calendarName,
    creatorId: event.payload.creatorId,
    inviteeUserIds: event.payload.inviteeUserIds,
    inviteeDepartmentIds: event.payload.inviteeDepartmentIds,
  };
}

/**
 * The people an event marks: tagged attendees plus every active member of each
 * tagged department (when a membership map is supplied). An organizer who is
 * not attending (not self-invited, outside any tagged department) is not
 * counted on their own out-of-camp listing — they merely own the event.
 */
export function involvedUserIds(
  event: Pick<ParadeEvent, "inviteeUserIds" | "inviteeDepartmentIds">,
  memberships?: DepartmentMemberships,
): string[] {
  const ids = new Set(event.inviteeUserIds);
  if (memberships) {
    for (const departmentId of event.inviteeDepartmentIds) {
      for (const userId of memberships.get(departmentId) ?? []) {
        ids.add(userId);
      }
    }
  }
  return [...ids];
}

/** Out-of-camp events first, then by start time. */
export function sortParadeEvents(events: readonly ParadeEvent[]): ParadeEvent[] {
  return [...events].sort((a, b) => {
    if (a.outOfCamp !== b.outOfCamp) return a.outOfCamp ? -1 : 1;
    return a.start.localeCompare(b.start);
  });
}

/**
 * Map each involved user id to their out-of-camp events for the day (sorted).
 * Department tags are expanded to their active members when `memberships` is
 * supplied. In-camp events are ignored — a user counts as in camp exactly when
 * their list is empty.
 */
export function buildEventsByUser(
  dayEvents: readonly ParadeEvent[],
  memberships?: DepartmentMemberships,
): Map<string, ParadeEvent[]> {
  const map = new Map<string, ParadeEvent[]>();
  for (const event of dayEvents) {
    if (!event.outOfCamp) continue;
    for (const userId of involvedUserIds(event, memberships)) {
      let list = map.get(userId);
      if (!list) {
        list = [];
        map.set(userId, list);
      }
      list.push(event);
    }
  }
  for (const [userId, events] of map) {
    map.set(userId, sortParadeEvents(events));
  }
  return map;
}

/**
 * Map each involved user id to *every* event that day, in camp and out of camp,
 * sorted chronologically by start. This backs the per-user day agenda; the
 * roster card itself keeps using `buildEventsByUser` (out-of-camp only).
 */
export function buildDayAgendaByUser(
  dayEvents: readonly ParadeEvent[],
  memberships?: DepartmentMemberships,
): Map<string, ParadeEvent[]> {
  const map = new Map<string, ParadeEvent[]>();
  for (const event of dayEvents) {
    for (const userId of involvedUserIds(event, memberships)) {
      let list = map.get(userId);
      if (!list) {
        list = [];
        map.set(userId, list);
      }
      list.push(event);
    }
  }
  for (const [userId, events] of map) {
    map.set(
      userId,
      [...events].sort((a, b) => a.start.localeCompare(b.start)),
    );
  }
  return map;
}
