/**
 * Pure, client-safe KAH look-ahead window helpers and shared view types. Kept
 * free of db/Next imports (only the pure event datetime helpers) so the server
 * data builder, the server action, and the client view can all import it.
 */

import { lastDayOfMonth, shiftMonth } from "@/lib/events/datetime";
import type { EventClashEntry } from "@/lib/events/clashActions";

/**
 * The KAH Status page's default look-ahead — also the window the nav breach
 * badge is fixed to (the badge never follows the page's selection).
 */
export const DEFAULT_KAH_RANGE_MONTHS = 3;

/** Every selectable KAH page look-ahead, in months (default first). */
export const KAH_RANGE_MONTHS = [3, 6, 12] as const;

export type KahRangeMonths = (typeof KAH_RANGE_MONTHS)[number];

/** Whether a value is one of the selectable look-aheads. */
export function isKahRangeMonths(value: number): value is KahRangeMonths {
  return (KAH_RANGE_MONTHS as readonly number[]).includes(value);
}

/**
 * Coerce an untrusted value (a Select value or server-action input) to a
 * selectable look-ahead, falling back to the default. Accepts a numeric string
 * or number; anything else → default.
 */
export function parseKahRange(value: unknown): KahRangeMonths {
  const months = typeof value === "string" ? Number(value) : value;
  return typeof months === "number" && isKahRangeMonths(months)
    ? months
    : DEFAULT_KAH_RANGE_MONTHS;
}

/** Human label for a look-ahead ("3 months", "1 year"). */
export function kahRangeLabel(months: KahRangeMonths): string {
  return months === 12 ? "1 year" : `${months} months`;
}

/**
 * The forward-only KAH window: from `today` (inclusive) through the last civil
 * day of the month `aheadMonths` months from today's month. There is no past
 * half — a breach that began before today is clipped at today
 * (`kahBreachEpisodes`).
 */
export function kahForwardWindow(
  today: string,
  aheadMonths: KahRangeMonths,
): { windowStart: string; windowEnd: string } {
  const todayMonth = today.slice(0, 7);
  return {
    windowStart: today,
    windowEnd: lastDayOfMonth(shiftMonth(todayMonth, aheadMonths)),
  };
}

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
