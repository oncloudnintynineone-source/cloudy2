/**
 * Pure, client-safe KAH look-ahead window helpers and shared view types.
 *
 * The KAH page deliberately offers a **wider forward horizon** than the rest of
 * the app (6 months by default, or 1 year): it answers "will our key people be
 * in country over the coming reporting season?", not "what is on this month?".
 * My Events and Double Booking keep the app-wide 1/6/12 vocabulary in
 * `src/lib/dateRange/monthRange.ts`; KAH only shares that module's window math
 * and label spelling. Kept free of db/Next imports (only the pure event
 * datetime helpers) so the server data builder, the server action, and the
 * client view can all import it.
 */

import { forwardWindow, rangeMonthsLabel } from "@/lib/dateRange/monthRange";
import type { EventClashEntry } from "@/lib/events/clashActions";

/**
 * The KAH Status page's default look-ahead — also the window the nav breach
 * badge is fixed to (the badge never follows the page's selection).
 */
export const DEFAULT_KAH_RANGE_MONTHS = 6;

/** Every selectable KAH page look-ahead, in months (the default first). */
export const KAH_RANGE_MONTHS = [6, 12] as const;

export type KahRangeMonths = (typeof KAH_RANGE_MONTHS)[number];

/** Whether a value is one of the selectable KAH look-aheads. */
export function isKahRangeMonths(value: unknown): value is KahRangeMonths {
  return (KAH_RANGE_MONTHS as readonly unknown[]).includes(value);
}

/**
 * Coerce an untrusted value (a menu value or server-action input) to a
 * selectable look-ahead, falling back to the default. The app-wide
 * `parseRangeMonths` cannot be used here: it still accepts `1`, which KAH no
 * longer offers.
 */
export function parseKahRange(value: unknown): KahRangeMonths {
  const months = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return isKahRangeMonths(months) ? months : DEFAULT_KAH_RANGE_MONTHS;
}

/** Human label for a look-ahead ("6 months", "1 year"). */
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

/** One continuous stretch a member is away, as inclusive UTC+8 civil dates. */
export interface KahAwaySpan {
  /** First away day (`YYYY-MM-DD`). */
  startDate: string;
  /** Last away day (`YYYY-MM-DD`). */
  endDate: string;
}

/** One active KAH-group member as the group card shows them. */
export interface KahGroupMemberRow {
  userId: string;
  name: string;
  /** Tagged on an overseas event overlapping today. */
  awayToday: boolean;
  /** Merged away stretches inside the scanned window, chronological. */
  spans: KahAwaySpan[];
}

/** A group's standing in the scanned window. */
export type KahGroupState = "active" | "upcoming" | "clear";

/** One KAH group with its roster and window summary, as the group card shows it. */
export interface KahGroupRow {
  groupId: string;
  name: string;
  requiredPct: number;
  totalMembers: number;
  /** Floored in-country share today. */
  todayPct: number;
  /** Members tagged away on an overseas event overlapping today. */
  awayTodayCount: number;
  members: KahGroupMemberRow[];
  /** Active (includes today) wins over upcoming; otherwise the group is clear. */
  state: KahGroupState;
  /** Breach periods (maximal runs of breached days) in the window. */
  episodeCount: number;
  /** Lowest floored in-country % across the window's breach periods. */
  worstPct: number | null;
  /** First day that hit `worstPct`, or null when the group never breached. */
  worstDate: string | null;
  /** Earliest active/upcoming breach period start, or null when clear. */
  nextBreachDate: string | null;
  /** The signed-in viewer belongs to this group. */
  isMember: boolean;
}

/** A member named on a breach period (the run's away union). */
export interface KahMemberRef {
  userId: string;
  name: string;
}

/** One breach period (consecutive breached days) for a group, with the away
 *  union and the overseas events that took those members away during the run.
 *  The group card owns the full roster; a period only names who was away. */
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
  awayMembers: KahMemberRef[];
  awayIds: string[];
  events: EventClashEntry[];
}

/** Everything the KAH Status view renders for one forward window. */
export interface KahStatusViewData {
  windowStart: string;
  windowEnd: string;
  rangeMonths: KahRangeMonths;
  /** The real admin role — every member sees all groups, so this is not a view flag. */
  isAdmin: boolean;
  /** Every KAH group in the window, sorted active → upcoming → clear, then name. */
  groups: KahGroupRow[];
  /** Every breach period in the window, active → upcoming, oldest run first. */
  episodes: KahEpisodeRow[];
}
