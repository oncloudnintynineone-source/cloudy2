import type { CalendarEvent } from "./queries";

/**
 * Keep only the explicitly-pinned events (an event is pinned only when the
 * `pinned` notes flag is set — tagging a department no longer pins it by
 * itself). This is the selection the durable cache stores, before the
 * time-window filter so ended events drop out on the next read instead of
 * waiting for a rebuild.
 */
export function selectPinnedEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => e.payload.pinned);
}

/**
 * Keep explicitly-pinned events, drop any whose end time has already passed
 * (compare the full naive `YYYY-MM-DD HH:mm:ss` end against `nowNaive`), and
 * sort by start time ascending. Pure — unit-tested without a DB or Google.
 */
export function selectUpcomingPinnedEvents(
  events: CalendarEvent[],
  nowNaive: string,
): CalendarEvent[] {
  const pinned = selectPinnedEvents(events);
  const upcoming = pinned.filter((e) => e.end > nowNaive);
  upcoming.sort((a, b) => a.start.localeCompare(b.start));
  return upcoming;
}
