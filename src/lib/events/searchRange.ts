/**
 * Pure helpers for the event-search date range and result ranking. The search
 * reads events from Google Calendar directly (bypassing the month cache), bounded
 * by an inclusive `YYYY-MM-DD` [from, to] window the user picks. Defaults,
 * boundary math and the substring-before-fuzzy tiering live here so they are
 * unit-testable without a DB or Google runtime.
 */

import { addDays, addOneDay, dateToUtc, exclusiveAbsEventRange } from "./datetime";
import { fuzzySearchRanked } from "@/lib/search/fuzzy";
import type { CalendarEvent } from "./queries";

/** Default window opens this many months before today. */
export const SEARCH_DEFAULT_MONTHS_BACK = 1;
/** Default window extends this many months after today. */
export const SEARCH_DEFAULT_MONTHS_AHEAD = 3;
/** Hard cap on the forward span of a search window (~2 years). */
export const SEARCH_MAX_RANGE_DAYS = 730;
/** Minimum query length accepted by the server action. */
export const SEARCH_MIN_QUERY_LENGTH = 2;

/** `YYYY-MM-DD` shape check (lexicographic order equals chronological order). */
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Add a signed number of months to `YYYY-MM-DD`, clamping the day to the target
 * month's length (Jan 31 - 1 month -> Dec 31; Mar 31 + 1 month -> Apr 30).
 */
export function addMonthsClamped(dateOnly: string, delta: number): string {
  const [year, monthIndex, day] = dateOnly.split("-").map(Number);
  let shiftedMonth = monthIndex - 1 + delta;
  const yearOut = year + Math.floor(shiftedMonth / 12);
  shiftedMonth = ((shiftedMonth % 12) + 12) % 12;
  const daysInMonth = new Date(Date.UTC(yearOut, shiftedMonth + 1, 0)).getUTCDate();
  const dayOut = Math.min(day, daysInMonth);
  return `${yearOut}-${String(shiftedMonth + 1).padStart(2, "0")}-${String(dayOut).padStart(2, "0")}`;
}

/** The default "from" date for `today` (`YYYY-MM-DD`). */
export function defaultSearchFrom(today: string): string {
  return addMonthsClamped(today, -SEARCH_DEFAULT_MONTHS_BACK);
}

/** The default "to" date for `today` (`YYYY-MM-DD`). */
export function defaultSearchTo(today: string): string {
  return addMonthsClamped(today, SEARCH_DEFAULT_MONTHS_AHEAD);
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
 * Normalize a user-supplied window: a reversed pair is swapped into ascending
 * order, and a forward span wider than `SEARCH_MAX_RANGE_DAYS` is clamped to it.
 */
export function coerceSearchRange(
  fromDate: string,
  toDate: string,
): { from: string; to: string } {
  const start = fromDate <= toDate ? fromDate : toDate;
  const end = fromDate <= toDate ? toDate : fromDate;
  const maxEnd = addDays(start, SEARCH_MAX_RANGE_DAYS);
  return { from: start, to: end <= maxEnd ? end : maxEnd };
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
