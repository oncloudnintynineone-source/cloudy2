/**
 * Pure helpers for the `?event=` dashboard deep link (event search, Pinned
 * Events, the Google Calendar `Edit:` note line).
 *
 * The link must open the target event's details **without** changing the
 * viewer's active dashboard tab or its stored filters. The active tab id is
 * therefore carried along as `?view=` (so `resolveActiveTab` can never fall
 * back to the remembered tab), and the target's calendar rides as `_eventCal`
 * so the server can resolve that one event even when the active filters exclude
 * it. I/O-free, so the URL shape and the lookup are unit-tested.
 */

import { formatInstantToNaive, shiftMonth } from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";

export interface EventDeepLinkInput {
  /** The active dashboard tab id to preserve (`?view=`), or null. */
  view: string | null;
  /** The target event's start; only its date part is used. */
  start: string;
  /** Logical event group id, or null for an external event (no details link). */
  eventId: string | null;
  /** The tapped copy's calendar id (`_eventCal`). */
  calendarId: string;
}

/** Build the `/dashboard` deep link that opens one event's details. */
export function buildEventDeepLink(input: EventDeepLinkInput): string {
  const params = new URLSearchParams();
  if (input.view) {
    params.set("view", input.view);
  }
  params.set("date", input.start.slice(0, 10));
  if (input.eventId) {
    params.set("event", input.eventId);
    params.set("_eventCal", input.calendarId);
  }
  return `/dashboard?${params.toString()}`;
}

/** The copy of a logical event (by group id) in a fetched set, or null. */
export function findEventByGroupId(
  events: readonly CalendarEvent[],
  eventId: string | null | undefined,
): CalendarEvent | null {
  if (!eventId) {
    return null;
  }
  return events.find((event) => event.payload.eventId === eventId) ?? null;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The month window the server reads to resolve a `?event=` deep-link target.
 * Deliberately independent of the active dashboard tab: it keys off the link's
 * own `?date=` (the target's start day) so a target outside the active tab's
 * months — e.g. a pinned event two months out on a Day tab — is still found.
 *
 * The event's own month plus the adjacent months: a long event (or a copy that
 * starts in the neighbouring month) can otherwise fall outside a single-month
 * read. Pure and I/O-free, so the window is unit-tested. When the link carries
 * no valid date, it falls back to the current month.
 */
export function deepLinkMonths(date: string | null | undefined): string[] {
  const anchor =
    typeof date === "string" && DATE_ONLY_PATTERN.test(date)
      ? date.slice(0, 7)
      : formatInstantToNaive(new Date()).slice(0, 7);
  return [...new Set([shiftMonth(anchor, -1), anchor, shiftMonth(anchor, 1)])].sort();
}
