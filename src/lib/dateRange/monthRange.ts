/**
 * The app's single date-range vocabulary: the month windows every range control
 * offers (My Events "Range", KAH Status and Double Booking "Look ahead") plus
 * the pure window math behind them. Kept free of db/Next imports (only the pure
 * event datetime helpers) so server pages, server actions and client views all
 * share one definition — the surfaces differ only in *style*: a `forward` window
 * counts months ahead of today (KAH, Double Booking), a `symmetric` window
 * counts months either side of today's month (My Events).
 */

import { lastDayOfMonth, shiftMonth } from "@/lib/events/datetime";

/** Every selectable window, in months. One list for the whole app. */
export const RANGE_MONTHS = [1, 6, 12] as const;

export type RangeMonths = (typeof RANGE_MONTHS)[number];

/** How a window is worded — see the module header. */
export type RangeStyle = "forward" | "symmetric";

/** One computed date window (`YYYY-MM-DD`, inclusive both ends). */
export interface RangeWindow {
  windowStart: string;
  windowEnd: string;
}

/** Whether a value is one of the selectable windows. */
export function isRangeMonths(value: unknown): value is RangeMonths {
  return (RANGE_MONTHS as readonly unknown[]).includes(value);
}

/**
 * Coerce an untrusted value (a menu value or a URL/search param) to a
 * selectable window, falling back to `fallback`. Accepts a numeric string or
 * number; anything else → `fallback`.
 */
export function parseRangeMonths(value: unknown, fallback: RangeMonths): RangeMonths {
  const months = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return isRangeMonths(months) ? months : fallback;
}

/**
 * Human label for a window, singular for one month:
 * `forward` → "1 month" / "6 months" / "1 year";
 * `symmetric` → "±1 month" / "±6 months" / "±1 year".
 */
export function rangeMonthsLabel(months: RangeMonths, style: RangeStyle): string {
  const prefix = style === "symmetric" ? "\u00b1" : "";
  if (months === 12) {
    return `${prefix}1 year`;
  }
  return `${prefix}${months} month${months === 1 ? "" : "s"}`;
}

/**
 * The forward-only window: from `today` (inclusive) through the last civil day
 * of the month `months` from today's month. `today` is a `YYYY-MM-DD` civil
 * date in the app's UTC+8 wall clock.
 */
export function forwardWindow(today: string, months: RangeMonths): RangeWindow {
  const todayMonth = today.slice(0, 7);
  return {
    windowStart: today,
    windowEnd: lastDayOfMonth(shiftMonth(todayMonth, months)),
  };
}

/**
 * The symmetric window: the first day of the month `months` before today's
 * month through the last civil day of the month `months` after it.
 */
export function symmetricWindow(today: string, months: RangeMonths): RangeWindow {
  const todayMonth = today.slice(0, 7);
  return {
    windowStart: `${shiftMonth(todayMonth, -months)}-01`,
    windowEnd: lastDayOfMonth(shiftMonth(todayMonth, months)),
  };
}
