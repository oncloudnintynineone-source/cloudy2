"use server";

import { formatInstantToNaive, monthsInRange } from "@/lib/events/datetime";
import {
  listCalendars,
  projectRangeEvents,
  readCalendarRange,
  type CalendarEvent,
} from "@/lib/events/queries";
import {
  coerceSearchMonths,
  countSubstringMatches,
  defaultSearchMonths,
  filterRangeForSearch,
  MONTH_KEY_PATTERN,
  monthEnd,
  monthStart,
  SEARCH_MIN_QUERY_LENGTH,
} from "@/lib/events/searchRange";
import { eventMatchesUserFilter } from "@/lib/events/userFilter";
import { listUsers } from "@/lib/roster/queries";
import { requireSession } from "@/lib/session";

export type SearchEventsResult =
  | { ok: true; events: CalendarEvent[]; exactCount: number; myEventIds: string[] }
  | { ok: false; error: string };

/**
 * Fuzzy free-text search across every department calendar, served from the
 * layered events cache (the whole date window is read as months, then trimmed
 * and fuzzy-matched) rather than a per-calendar Google `q`. `fromMonth`/`toMonth`
 * are `YYYY-MM` keys — the modal picks **whole months**, which is also the unit
 * the cache stores — expanded to the first day of `fromMonth` through the last
 * day of `toMonth`; a malformed key falls back to the default window and the
 * pair is coerced into an ordered, capped range. Results are mapped,
 * deduped by logical event, and returned in relevance order (chronological on
 * ties / blank query), tiered: events whose fields literally contain the query
 * lead, typo-tolerant Fuse hits follow. `exactCount` is how many leading results
 * are in that first tier — the split index the modal renders its two sections at
 * (see `countSubstringMatches`).
 */
export async function searchEvents(
  q: string,
  fromMonth: string,
  toMonth: string,
): Promise<SearchEventsResult> {
  const session = await requireSession();

  const query = (q ?? "").trim();
  if (query.length < SEARCH_MIN_QUERY_LENGTH) {
    return { ok: false, error: `Enter at least ${SEARCH_MIN_QUERY_LENGTH} characters to search` };
  }

  const today = formatInstantToNaive(new Date()).slice(0, 10);
  const fallback = defaultSearchMonths(today);
  const range = coerceSearchMonths(
    MONTH_KEY_PATTERN.test(fromMonth ?? "") ? fromMonth : fallback.fromMonth,
    MONTH_KEY_PATTERN.test(toMonth ?? "") ? toMonth : fallback.toMonth,
  );
  const fromDate = monthStart(range.fromMonth);
  const toDate = monthEnd(range.toMonth);

  const allCalendars = await listCalendars();
  const data = await readCalendarRange({
    months: monthsInRange(fromDate, toDate),
    calendarIds: allCalendars.map((calendar) => calendar.id),
  });
  const rangeEvents = projectRangeEvents(data, { typeFilter: [], userFilter: [] });
  const events = filterRangeForSearch(rangeEvents, fromDate, toDate, query);
  // The tier boundary the modal renders its two sections at (the results come
  // back contiguous: literal "contains text" hits first, typo-tolerant after).
  const exactCount = countSubstringMatches(events, query);

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

  return { ok: true, events, exactCount, myEventIds };
}
