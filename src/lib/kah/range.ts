/**
 * Pure, client-safe KAH look-ahead window helpers and shared view types. The
 * look-ahead *vocabulary* is app-wide (`src/lib/dateRange/monthRange.ts`); this
 * module is the KAH face of it — a forward-only window. Kept free of db/Next
 * imports (only the pure event datetime helpers) so the server data builder,
 * the server action, and the client view can all import it.
 */

import {
  forwardWindow,
  isRangeMonths,
  parseRangeMonths,
  rangeMonthsLabel,
  RANGE_MONTHS,
  type RangeMonths,
} from "@/lib/dateRange/monthRange";
import type { EventClashEntry } from "@/lib/events/clashActions";

/**
 * The KAH Status page's default look-ahead — also the window the nav breach
 * badge is fixed to (the badge never follows the page's selection).
 */
export const DEFAULT_KAH_RANGE_MONTHS = 1;

/** Every selectable KAH page look-ahead, in months (the app-wide set). */
export const KAH_RANGE_MONTHS = RANGE_MONTHS;

export type KahRangeMonths = RangeMonths;

/** Whether a value is one of the selectable look-aheads. */
export const isKahRangeMonths = isRangeMonths;

/**
 * Coerce an untrusted value (a menu value or server-action input) to a
 * selectable look-ahead, falling back to the default.
 */
export function parseKahRange(value: unknown): KahRangeMonths {
  return parseRangeMonths(value, DEFAULT_KAH_RANGE_MONTHS);
}

/** Human label for a look-ahead ("1 month", "1 year"). */
export function kahRangeLabel(months: KahRangeMonths): string {
  return rangeMonthsLabel(months, "forward");
}

/**
 * The forward-only KAH window: from `today` (inclusive) through the last civil
 * day of the month `aheadMonths` months from today's month. There is no past
 * half — a breach that began before today is clipped at today
 * (`kahBreachEpisodes`).
 */
export const kahForwardWindow = forwardWindow;

/** One active KAH-group member as the breach card shows them. */
export interface KahMember {
  userId: string;
  name: string;
  away: boolean;
}

/** One breach period (consecutive breached days) for a group, with its roster
 *  and the overseas events that took members away during the run. */
export interface KahEpisodeRow {
  groupId: string;
  groupName: string;
  requiredPct: number;
  startDate: string;
  endDate: string;
  days: number;
  worstPct: number;
  /** First day that hit `worstPct` (`YYYY-MM-DD`). */
  worstDate: string;
  clippedStart: boolean;
  clippedEnd: boolean;
  status: "active" | "upcoming" | "resolved";
  totalMembers: number;
  members: KahMember[];
  events: EventClashEntry[];
}

/** Everything the KAH Status view renders for one forward window. */
export interface KahStatusViewData {
  windowStart: string;
  windowEnd: string;
  rangeMonths: KahRangeMonths;
  /** Admin view: shows every KAH group (not just the viewer's memberships). */
  allGroups: boolean;
  episodes: KahEpisodeRow[];
  /** Groups with no breached day in the window. */
  allClearGroups: string[];
}
