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
import { getGoogleIntegration } from "@/lib/google";
import { getUsersByIds } from "@/lib/roster/queries";
import { formatFullName } from "@/lib/settings/formatName";
import { getSettings } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";

/** Max concurrent Google `events.list` (±`q`) calls for one search. */
const SEARCH_CONCURRENCY = 4;

export type SearchEventsResult =
  | { ok: true; events: CalendarEvent[]; currentUserId: string; isAdmin: boolean }
  | { ok: false; error: string };

/**
 * Free-text search across every department calendar, read directly from Google
 * Calendar (the month cache is deliberately bypassed). Results are mapped and
 * deduped by logical event (one representative copy per group id), sorted by
 * start, and returned as schedule-ready `CalendarEvent`s together with the
 * viewer's identity for role-gated detail actions.
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

  return {
    ok: true,
    events: dedupeEventsByGroupId(events),
    currentUserId: session.user.id,
    isAdmin: session.user.role === "admin",
  };
}

/**
 * Resolve the display names a search-origin event detail needs — the creator +
 * invitee user names and the tagged department names — applied through the
 * configured display-name template. A fast DB read (no Google), so the detail
 * modal's loading skeleton is short-lived.
 */
export async function resolveEventDetailNames(params: {
  creatorId: string | null;
  userIds: string[];
  departmentIds: string[];
}): Promise<{ peopleNames: Record<string, string>; calendarNames: Record<string, string> }> {
  const settings = await getSettings();
  const ids = [params.creatorId, ...params.userIds].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  const [users, calendars] = await Promise.all([getUsersByIds(ids), listCalendars()]);

  const peopleNames: Record<string, string> = {};
  for (const user of users) {
    peopleNames[user.id] = formatFullName(
      { name: user.name, departmentName: user.departmentName },
      settings.nameTemplate,
    );
  }

  const departmentIds = new Set(params.departmentIds);
  const calendarNames: Record<string, string> = {};
  for (const calendar of calendars) {
    if (departmentIds.has(calendar.id)) {
      calendarNames[calendar.id] = calendar.name;
    }
  }

  return { peopleNames, calendarNames };
}
