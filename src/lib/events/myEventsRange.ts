/**
 * Pure, client-safe helpers for the My Events page's date window. Kept free of
 * db/Next imports (only the pure event datetime helpers) so the server page,
 * the server action, and the client view can all share them — the same shape as
 * `src/lib/kah/range.ts`. The window is symmetric (±`months` around today's
 * month), unlike KAH's forward-only look-ahead, because "events I created"
 * spans both past and future.
 */

import { lastDayOfMonth, shiftMonth } from "@/lib/events/datetime";

/** The My Events page's default window — ±3 months around the current month. */
export const DEFAULT_MY_EVENTS_RANGE_MONTHS = 3;

/** Every selectable My Events window, in months either side (default first). */
export const MY_EVENTS_RANGE_MONTHS = [3, 6, 12] as const;

export type MyEventsRangeMonths = (typeof MY_EVENTS_RANGE_MONTHS)[number];

/** Whether a value is one of the selectable windows. */
export function isMyEventsRangeMonths(value: number): value is MyEventsRangeMonths {
  return (MY_EVENTS_RANGE_MONTHS as readonly number[]).includes(value);
}

/**
 * Coerce an untrusted value (a Select value or a URL/search param) to a
 * selectable window, falling back to the default. Accepts a numeric string or
 * number; anything else → default.
 */
export function parseMyEventsRange(value: unknown): MyEventsRangeMonths {
  const months = typeof value === "string" ? Number(value) : value;
  return typeof months === "number" && isMyEventsRangeMonths(months)
    ? months
    : DEFAULT_MY_EVENTS_RANGE_MONTHS;
}

/** Human label for a window ("±3 months", "±1 year"). */
export function myEventsRangeLabel(months: MyEventsRangeMonths): string {
  return months === 12 ? "\u00b11 year" : `\u00b1${months} months`;
}

/**
 * The symmetric My Events window: the first day of the month `months` before
 * today's month through the last civil day of the month `months` after it.
 * `today` is a `YYYY-MM-DD` civil date in the app's UTC+8 wall clock.
 */
export function myEventsWindow(
  today: string,
  months: MyEventsRangeMonths,
): { windowStart: string; windowEnd: string } {
  const todayMonth = today.slice(0, 7);
  return {
    windowStart: `${shiftMonth(todayMonth, -months)}-01`,
    windowEnd: lastDayOfMonth(shiftMonth(todayMonth, months)),
  };
}
