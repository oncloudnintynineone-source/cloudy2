"use server";

import { mapWithConcurrency } from "@/lib/async";
import { listEventTypes } from "@/lib/eventTypes/queries";
import { formatInstantToNaive } from "@/lib/events/datetime";
import {
  listCalendars,
  mapCalendarItem,
  type CalendarEvent,
} from "@/lib/events/queries";
import {
  coerceSearchRange,
  DATE_ONLY_PATTERN,
  defaultSearchFrom,
  defaultSearchTo,
  searchRangeBoundaries,
  SEARCH_MIN_QUERY_LENGTH,
} from "@/lib/events/searchRange";
import { dedupeEventsByGroupId } from "@/lib/events/targets";
import { eventMatchesUserFilter } from "@/lib/events/userFilter";
import { getGoogleIntegration } from "@/lib/google";
import { requireSession } from "@/lib/session";

/** Max concurrent Google `events.list` (±`q`) calls for one search. */
const SEARCH_CONCURRENCY = 4;

export type SearchEventsResult =
  | { ok: true; events: CalendarEvent[]; myEventIds: string[] }
  | { ok: false; error: string };

/**
 * Free-text search across every department calendar, read directly from Google
 * Calendar (the month cache is deliberately bypassed). Results are mapped and
 * deduped by logical event (one representative copy per group id), sorted by
 * start, and returned as schedule-ready `CalendarEvent`s.
 */
export async function searchEvents(
  q: string,
  from: string,
  to: string,
): Promise<SearchEventsResult> {
  const session = await requireSession();

  const query = (q ?? "").trim();
  if (query.length < SEARCH_MIN_QUERY_LENGTH) {
    return { ok: false, error: `Enter at least ${SEARCH_MIN_QUERY_LENGTH} characters to search` };
  }

  const today = formatInstantToNaive(new Date()).slice(0, 10);
  const { from: fromDate, to: toDate } = coerceSearchRange(
    DATE_ONLY_PATTERN.test(from ?? "") ? from : defaultSearchFrom(today),
    DATE_ONLY_PATTERN.test(to ?? "") ? to : defaultSearchTo(today),
  );

  const integration = await getGoogleIntegration();
  const allCalendars = await listCalendars();
  const allEventTypes = await listEventTypes();
  const typeColors = new Map(allEventTypes.map((row) => [row.name, row.color]));

  const { timeMin, timeMax } = searchRangeBoundaries(fromDate, toDate);

  const perCalendar = await mapWithConcurrency(
    allCalendars,
    SEARCH_CONCURRENCY,
    async (calendar) => {
      const items = await integration.searchEvents(
        calendar.googleCalendarId,
        query,
        timeMin,
        timeMax,
      );
      return { calendar, items };
    },
  );

  const events: CalendarEvent[] = [];
  for (const { calendar, items } of perCalendar) {
    for (const item of items) {
      const mapped = mapCalendarItem(
        { id: calendar.id, name: calendar.name, color: calendar.color },
        item,
        { typeFilter: [], userFilter: [] },
        typeColors,
      );
      if (mapped) {
        events.push(mapped);
      }
    }
  }

  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const deduped = dedupeEventsByGroupId(events);
  // The current user's own events (tagged attendee) — the client reuses the
  // dashboard's amber "mine" highlight on these rows. Organizer-only events
  // (not self-tagged) don't count, matching `eventMatchesUserFilter`.
  const myEventIds = deduped
    .filter((event) => eventMatchesUserFilter(event.payload, [session.user.id]))
    .map((event) => event.id);

  return { ok: true, events: deduped, myEventIds };
}
