/**
 * Pure, client-safe look-ahead window for the Double Booking page. It uses the
 * app-wide range vocabulary (`src/lib/dateRange/monthRange.ts`) — a forward
 * window from today, the same shape as KAH's — but keeps its own default,
 * because a clash scan is a per-user question rather than a group-constraint
 * one, and the nav clash badge reads it through `checkUserClashes({})`.
 */

import {
  forwardWindow,
  parseRangeMonths,
  type RangeMonths,
  type RangeWindow,
} from "@/lib/dateRange/monthRange";

/** The default look-ahead: today through the end of next month. */
export const DEFAULT_USER_CLASH_AHEAD_MONTHS: RangeMonths = 1;

export type UserClashAheadMonths = RangeMonths;

/** Coerce an untrusted value (a menu value or server-action input) to a
 *  selectable look-ahead, falling back to the default. */
export function parseUserClashAhead(value: unknown): UserClashAheadMonths {
  return parseRangeMonths(value, DEFAULT_USER_CLASH_AHEAD_MONTHS);
}

/** The scan window: `today` (inclusive) through the last civil day of the
 *  month `aheadMonths` from today's month. */
export const userClashWindow = (today: string, aheadMonths: UserClashAheadMonths): RangeWindow =>
  forwardWindow(today, aheadMonths);
