import type { CalendarEvent } from "./queries";

/**
 * Keep the explicitly-pinned events (an event is pinned only when the
 * `pinned` notes flag is set — tagging a department no longer pins it by
 * itself), drop any whose end time has already passed (compare the full naive
 * `YYYY-MM-DD HH:mm:ss` end against `nowNaive`), and sort by start time
 * ascending. Pure — unit-tested without a DB or Google.
 */
export function selectUpcomingPinnedEvents(
  events: CalendarEvent[],
  nowNaive: string,
): CalendarEvent[] {
  const pinned = events.filter((e) => e.payload.pinned);
  const upcoming = pinned.filter((e) => e.end > nowNaive);
  upcoming.sort((a, b) => a.start.localeCompare(b.start));
  return upcoming;
}
