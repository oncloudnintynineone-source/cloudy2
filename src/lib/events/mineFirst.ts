/**
 * Pure helpers for the dashboard's "highlight my entries" treatment. The
 * Month view assigns each day's rows greedily in input order (first
 * available row), so feeding events with the current user's entries first
 * makes them claim the top rows of every day. Kept free of I/O for unit
 * testing.
 */

import dayjs from "dayjs";

import type { CalendarEvent } from "./queries";

function compareByStart(a: CalendarEvent, b: CalendarEvent): number {
  const startDiff = dayjs(a.start).diff(dayjs(b.start));
  if (startDiff !== 0) return startDiff;
  const endDiff = dayjs(a.end).diff(dayjs(b.end));
  if (endDiff !== 0) return endDiff;
  return a.id.localeCompare(b.id);
}

/**
 * Reorder `events` into two blocks — the ones whose id is in `myIds` first,
 * the rest second — each block sorted by start time (end, then id as
 * deterministic tie-breaks). Returns a new array; the input is not mutated.
 *
 * With no ids in `myIds` this is simply a stable time sort of the whole list.
 */
export function sortMineFirst(events: CalendarEvent[], myIds: ReadonlySet<string>): CalendarEvent[] {
  const mine: CalendarEvent[] = [];
  const rest: CalendarEvent[] = [];
  for (const event of events) {
    (myIds.has(event.id) ? mine : rest).push(event);
  }
  mine.sort(compareByStart);
  rest.sort(compareByStart);
  return [...mine, ...rest];
}
