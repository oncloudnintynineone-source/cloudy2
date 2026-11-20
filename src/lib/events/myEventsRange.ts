/**
 * Pure, client-safe helpers for the My Events page's date window. The window
 * *vocabulary* is app-wide (`src/lib/dateRange/monthRange.ts`); this module is
 * the My Events face of it — a symmetric (±`months`) window around today's
 * month, unlike KAH's forward-only look-ahead, because "events I created" spans
 * both past and future. Kept free of db/Next imports so the server page, the
 * server action, and the client view can all share them.
 */

import {
  isRangeMonths,
  parseRangeMonths,
  rangeMonthsLabel,
  symmetricWindow,
  RANGE_MONTHS,
  type RangeMonths,
} from "@/lib/dateRange/monthRange";

/** The My Events page's default window — ±1 month around the current month. */
export const DEFAULT_MY_EVENTS_RANGE_MONTHS = 1;

/** Every selectable My Events window, in months either side (the app-wide set). */
export const MY_EVENTS_RANGE_MONTHS = RANGE_MONTHS;

export type MyEventsRangeMonths = RangeMonths;

/** Whether a value is one of the selectable windows. */
export const isMyEventsRangeMonths = isRangeMonths;

/**
 * Coerce an untrusted value (a menu value or a URL/search param) to a
 * selectable window, falling back to the default.
 */
export function parseMyEventsRange(value: unknown): MyEventsRangeMonths {
  return parseRangeMonths(value, DEFAULT_MY_EVENTS_RANGE_MONTHS);
}

/** Human label for a window ("±1 month", "±1 year"). */
export function myEventsRangeLabel(months: MyEventsRangeMonths): string {
  return rangeMonthsLabel(months, "symmetric");
}

/**
 * The symmetric My Events window: the first day of the month `months` before
 * today's month through the last civil day of the month `months` after it.
 * `today` is a `YYYY-MM-DD` civil date in the app's UTC+8 wall clock.
 */
export const myEventsWindow = symmetricWindow;
