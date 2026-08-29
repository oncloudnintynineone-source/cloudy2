import type { CalendarEvent } from "./queries";

/**
 * Keep the explicitly-pinned events (an event is pinned only when the
 * `pinned` notes flag is set — tagging a department no longer pins it by
 * itself), drop any that have already ended before `todayNaive` (a naive
 * `YYYY-MM-DD`), and sort by start time ascending. Pure — unit-tested without
 * a DB or Google.
 */
export function selectUpcomingPinnedEvents(
  events: CalendarEvent[],
  todayNaive: string,
): CalendarEvent[] {
  const pinned = events.filter((e) => e.payload.pinned);
  const upcoming = pinned.filter((e) => e.end.slice(0, 10) >= todayNaive);
  upcoming.sort((a, b) => a.start.localeCompare(b.start));
  return upcoming;
}
