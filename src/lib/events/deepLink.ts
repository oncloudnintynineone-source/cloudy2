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
