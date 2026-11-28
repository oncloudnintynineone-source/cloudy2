/**
 * Pure helpers for the event-search date range and result ranking. The search
 * reads events from Google Calendar through the month cache, bounded by an
 * inclusive **month window** (`YYYY-MM` keys) the user picks — the same
 * month-granular vocabulary the rest of the app's range controls use, and a
 * perfect fit for a cache that stores whole months. The window is expanded to
 * whole days (`monthStart`/`monthEnd`) at the edge of the read, which is where
 * the day-level helpers below take over. Defaults, boundary math and the
 * substring-before-fuzzy tiering live here so they are unit-testable without a
 * DB or Google runtime.
 */

import dayjs from "dayjs";
import {
  addOneDay,
  dateToUtc,
  exclusiveAbsEventRange,
  lastDayOfMonth,
  shiftMonth,
} from "./datetime";
import { fuzzySearchRanked } from "@/lib/search/fuzzy";
import type { CalendarEvent } from "./queries";

/** Default window opens this many months before today. */
export const SEARCH_DEFAULT_MONTHS_BACK = 1;
/** Default window extends this many months after today. */
export const SEARCH_DEFAULT_MONTHS_AHEAD = 3;
/** Hard cap on the span of a search window, counted in whole months (2 years). */
export const SEARCH_MAX_RANGE_MONTHS = 24;
/** Minimum query length accepted by the server action. */
export const SEARCH_MIN_QUERY_LENGTH = 2;

/** `YYYY-MM` month-key shape check (lexicographic order equals chronological order). */
export const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

/** The first day of a `YYYY-MM` month, as `YYYY-MM-DD`. */
export function monthStart(monthKey: string): string {
  return `${monthKey}-01`;
}

/** The last day of a `YYYY-MM` month, as `YYYY-MM-DD` (Feb 29 on leap years). */
export function monthEnd(monthKey: string): string {
  return lastDayOfMonth(monthKey);
}

/**
 * The default search window for `today` (`YYYY-MM-DD`): the whole month
 * `SEARCH_DEFAULT_MONTHS_BACK` back through the whole month
 * `SEARCH_DEFAULT_MONTHS_AHEAD` ahead.
 */
export function defaultSearchMonths(today: string): { fromMonth: string; toMonth: string } {
  const current = today.slice(0, 7);
  return {
    fromMonth: shiftMonth(current, -SEARCH_DEFAULT_MONTHS_BACK),
    toMonth: shiftMonth(current, SEARCH_DEFAULT_MONTHS_AHEAD),
  };
}

/** Whole months from `fromMonth` to `toMonth`, inclusive (same month → 1). */
function monthSpan(fromMonth: string, toMonth: string): number {
  const [fromYear, fromIndex] = fromMonth.split("-").map(Number);
  const [toYear, toIndex] = toMonth.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toIndex - fromIndex) + 1;
}

/**
 * Normalize a user-supplied month window: a reversed pair is swapped into
 * ascending order, and a span wider than `SEARCH_MAX_RANGE_MONTHS` keeps its
 * `from` and pulls `to` back. The pickers bound each other so neither case is
 * reachable through the UI — this is the server-side guarantee.
 */
export function coerceSearchMonths(
  fromMonth: string,
  toMonth: string,
): { fromMonth: string; toMonth: string } {
  const start = fromMonth <= toMonth ? fromMonth : toMonth;
  const end = fromMonth <= toMonth ? toMonth : fromMonth;
  if (monthSpan(start, end) <= SEARCH_MAX_RANGE_MONTHS) {
    return { fromMonth: start, toMonth: end };
  }
  return { fromMonth: start, toMonth: shiftMonth(start, SEARCH_MAX_RANGE_MONTHS - 1) };
}

/** A single `YYYY-MM` month as `Nov 2026`. */
export function monthLabel(monthKey: string): string {
  return dayjs(`${monthKey}-01`).format("MMM YYYY");
}

/**
 * Human-readable window label for the results header: `Nov 2026 – Feb 2027`,
 * or a single month when the window is one month wide.
 */
export function monthRangeLabel(fromMonth: string, toMonth: string): string {
  return fromMonth === toMonth
    ? monthLabel(fromMonth)
    : `${monthLabel(fromMonth)} – ${monthLabel(toMonth)}`;
}

/**
 * Inclusive `YYYY-MM-DD` [from, to] window -> Google `events.list` instants.
 * The end uses Google's exclusive all-day convention (`addOneDay(to)`), so an
 * event occurring entirely on the `to` date is still included.
 */
export function searchRangeBoundaries(
  fromDate: string,
  toDate: string,
): { timeMin: Date; timeMax: Date } {
  return {
    timeMin: dateToUtc(fromDate),
    timeMax: dateToUtc(addOneDay(toDate)),
  };
}

/**
 * True when an event's absolute span overlaps the inclusive `[fromDate, toDate]`
 * window (Google's exclusive end convention handled by
 * {@link exclusiveAbsEventRange}). The cache read returns whole months, so this
 * trims the extra days at the window edges.
 */
export function eventWithinRange(
  event: CalendarEvent,
  fromDate: string,
  toDate: string,
): boolean {
  const { timeMin, timeMax } = searchRangeBoundaries(fromDate, toDate);
  const { start, end } = exclusiveAbsEventRange(
    event.start,
    event.end,
    event.payload.allDay,
  );
  return start < timeMax && end > timeMin;
}

/** Fields the fuzzy event search matches. */
const EVENT_SEARCH_KEYS = [
  "title",
  "payload.location",
  "payload.eventType",
  "payload.calendarName",
] as const;

/**
 * The two result tiers event search orders by: a query that appears **verbatim**
 * in a searchable field leads, typo-tolerant Fuse hits follow.
 */
export type SearchMatchTier = "substring" | "fuzzy";

/** The four searchable strings of an event (same set as `EVENT_SEARCH_KEYS`). */
function searchableFields(event: CalendarEvent): string[] {
  return [
    event.title,
    event.payload.location,
    event.payload.eventType ?? "",
    event.payload.calendarName,
  ];
}

/**
 * True when `query` occurs as a literal, case-insensitive substring of any
 * searchable field of the event. A blank query matches everything.
 */
export function eventSubstringMatch(event: CalendarEvent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") {
    return true;
  }
  return searchableFields(event).some((field) => field.toLowerCase().includes(q));
}

/** Which tier an event lands in for the given query. */
export function searchMatchTier(event: CalendarEvent, query: string): SearchMatchTier {
  return eventSubstringMatch(event, query) ? "substring" : "fuzzy";
}

/**
 * How many **leading** results are literal ("contains text") matches — the split
 * index between the two sections the search modal renders.
 * {@link filterRangeForSearch} returns the tiers contiguously (the substring
 * bucket first), so counting the leading matches *is* the boundary; a blank
 * query counts everything, and a result set of pure typo hits returns `0`.
 */
export function countSubstringMatches(events: readonly CalendarEvent[], query: string): number {
  const q = query.trim().toLowerCase();
  if (q === "") {
    return events.length;
  }
  let count = 0;
  while (count < events.length && eventSubstringMatch(events[count], q)) {
    count += 1;
  }
  return count;
}

/**
 * Narrow a cache-read range to the exact date window and, when a query is given,
 * filter by title/location/type/calendar in **tier order**: literal substring
 * matches first, then the typo-tolerant ones. Inside each tier the Fuse relevance
 * rank is kept (and its score ties fall back to chronological order, thanks to
 * the pre-sort by start). A blank query returns the in-window events
 * chronologically.
 */
export function filterRangeForSearch(
  events: readonly CalendarEvent[],
  fromDate: string,
  toDate: string,
  query: string,
): CalendarEvent[] {
  const within = events.filter((event) => eventWithinRange(event, fromDate, toDate));
  const q = query.trim();
  if (q === "") {
    return within;
  }
  const chronological = [...within].sort((a, b) =>
    a.start < b.start ? -1 : a.start > b.start ? 1 : 0,
  );
  const ranked = fuzzySearchRanked(chronological, q, [...EVENT_SEARCH_KEYS]);
  const substring: CalendarEvent[] = [];
  const fuzzy: CalendarEvent[] = [];
  for (const { item } of ranked) {
    if (eventSubstringMatch(item, q)) {
      substring.push(item);
    } else {
      fuzzy.push(item);
    }
  }
  return [...substring, ...fuzzy];
}
