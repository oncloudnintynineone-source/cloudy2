"use server";

import { formatInstantToNaive, monthsInRange } from "@/lib/events/datetime";
import {
  listCalendars,
  projectRangeEvents,
  readCalendarRange,
  type CalendarEvent,
} from "@/lib/events/queries";
import {
  coerceSearchRange,
  DATE_ONLY_PATTERN,
  defaultSearchFrom,
  defaultSearchTo,
  filterRangeForSearch,
  SEARCH_MIN_QUERY_LENGTH,
} from "@/lib/events/searchRange";
import { eventMatchesUserFilter } from "@/lib/events/userFilter";
import { listUsers } from "@/lib/roster/queries";
import { requireSession } from "@/lib/session";

export type SearchEventsResult =
  | { ok: true; events: CalendarEvent[]; myEventIds: string[] }
  | { ok: false; error: string };

/**
 * Fuzzy free-text search across every department calendar, served from the
 * layered events cache (the whole date window is read as months, then trimmed
 * and fuzzy-matched) rather than a per-calendar Google `q`. Results are mapped,
 * deduped by logical event, and returned in relevance order (chronological on
 * ties / blank query).
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

  const allCalendars = await listCalendars();
  const data = await readCalendarRange({
    months: monthsInRange(fromDate, toDate),
    calendarIds: allCalendars.map((calendar) => calendar.id),
  });
  const rangeEvents = projectRangeEvents(data, { typeFilter: [], userFilter: [] });
  const events = filterRangeForSearch(rangeEvents, fromDate, toDate, query);

  // Active roster grouped by department — the "mine" highlight matches an event
  // tagged on a department the user is an active member of, exactly like the
  // dashboard's Users filter (`eventMatchesUserFilter`).
  const allUsers = await listUsers();
  const membershipsByDepartment = new Map<string, string[]>();
  for (const user of allUsers) {
    const departmentId = user.department?.id;
    if (user.status !== "active" || !departmentId) {
      continue;
    }
    const list = membershipsByDepartment.get(departmentId);
    if (list) {
      list.push(user.id);
    } else {
      membershipsByDepartment.set(departmentId, [user.id]);
    }
  }

  const myEventIds = events
    .filter((event) =>
      eventMatchesUserFilter(event.payload, [session.user.id], membershipsByDepartment),
    )
    .map((event) => event.id);

  return { ok: true, events, myEventIds };
}
