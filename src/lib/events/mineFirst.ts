/**
 * Pure helpers for the dashboard's "highlight my entries" treatment. The
 * Month view assigns each day's rows greedily in input order (first
 * available row), so feeding events with the current user's entries first
 * makes them claim the top rows of every day. Kept free of I/O for unit
 * testing.
 */

import dayjs from "dayjs";

import type { CalendarEvent } from "./queries";

/**
 * Sort in place by start time (end, then id as deterministic tie-breaks),
 * parsing each event's instants once up front. The previous comparator built
 * four `dayjs` objects per comparison — O(n log n) parses for an O(n) job.
 */
function sortByStart(events: CalendarEvent[]): void {
  const decorated = events.map((event) => ({
    event,
    start: dayjs(event.start).valueOf(),
    end: dayjs(event.end).valueOf(),
  }));
  decorated.sort(
    (a, b) => a.start - b.start || a.end - b.end || a.event.id.localeCompare(b.event.id),
  );
  for (let i = 0; i < decorated.length; i += 1) {
    events[i] = decorated[i].event;
  }
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
  sortByStart(mine);
  sortByStart(rest);
  return [...mine, ...rest];
}
