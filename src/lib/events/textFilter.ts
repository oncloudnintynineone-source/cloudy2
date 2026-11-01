/**
 * Dashboard event-name text filter: a case-insensitive substring match over the
 * typed event name (`payload.rawTitle`) and the rendered title (`title`). Pure
 * and I/O-free so the dashboard projection and its unit tests share it.
 *
 * The notes body is deliberately not searched: it is parsed away before events
 * reach the client, and this filter runs on already-projected events.
 */

import type { CalendarEvent } from "@/lib/events/queries";

/**
 * True when `query` occurs as a literal, case-insensitive substring of the
 * event's typed name or rendered title. A blank query matches everything.
 */
export function eventNameMatchesText(
  rawTitle: string | null | undefined,
  title: string,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") {
    return true;
  }
  return (title ?? "").toLowerCase().includes(q) || (rawTitle ?? "").toLowerCase().includes(q);
}

/**
 * Narrow events to those whose name matches `query`. Blank/null returns the
 * input array unchanged (no allocation, no reordering).
 */
export function filterEventsByText(
  events: CalendarEvent[],
  query: string | null | undefined,
): CalendarEvent[] {
  const q = (query ?? "").trim();
  if (q === "") {
    return events;
  }
  return events.filter((event) => eventNameMatchesText(event.payload.rawTitle, event.title, q));
}
