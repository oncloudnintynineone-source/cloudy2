/**
 * Pure KAH view shaping: the per-member away calendar and the per-group state
 * summary the status page renders. Kept free of db/Next imports so it can be
 * unit-tested (and imported by the server view builder) without a database.
 */

import { addOneDay, formatInstantToNaive, parseNaiveToInstant } from "@/lib/events/datetime";
import type { KahAwaySpan, KahEpisodeRow, KahGroupState } from "@/lib/kah/range";

/** The minimal event shape the away calendar needs (effective occupancy + tags). */
export interface AwayEventLike {
  readonly userIds: readonly string[];
  /** Inclusive start of the effective (SGT-aligned) occupancy. */
  readonly start: Date;
  /** Exclusive end of the effective occupancy window. */
  readonly end: Date;
}

/**
 * Merge one member's away stretches: chronological, and adjacent runs joined so
 * a member who is away on back-to-back events reads as one trip rather than two
 * chips.
 */
function mergeSpans(spans: readonly KahAwaySpan[]): KahAwaySpan[] {
  const sorted = [...spans].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const merged: KahAwaySpan[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    // `<= addOneDay(last.endDate)` means overlap or exactly the next civil day.
    if (last && span.startDate <= addOneDay(last.endDate)) {
      if (span.endDate > last.endDate) {
        last.endDate = span.endDate;
      }
      continue;
    }
    merged.push({ ...span });
  }
  return merged;
}

/**
 * Every member's merged away stretches inside the scanned window, keyed by
 * member id. Events are clipped to the window (inclusive civil dates in the
 * app's UTC+8 wall clock) before merging, so a long trip that began before today
 * reads from today and one that runs past the window end stops at the last
 * scanned day. Members with no away event are absent from the map.
 */
export function awaySpansByMember(
  events: readonly AwayEventLike[],
  memberIds: readonly string[],
  windowStart: string,
  windowEnd: string,
): Map<string, KahAwaySpan[]> {
  const memberSet = new Set(memberIds);
  if (memberSet.size === 0) {
    return new Map();
  }
  const windowStartInstant = parseNaiveToInstant(`${windowStart} 00:00:00`);
  // Half-open window end: the first instant after the last scanned day.
  const windowEndInstant = parseNaiveToInstant(`${addOneDay(windowEnd)} 00:00:00`);

  const collected = new Map<string, KahAwaySpan[]>();
  for (const event of events) {
    const start = event.start < windowStartInstant ? windowStartInstant : event.start;
    const end = event.end > windowEndInstant ? windowEndInstant : event.end;
    if (start >= end) {
      continue;
    }
    const startDate = formatInstantToNaive(start).slice(0, 10);
    // The exclusive end's last covered instant lands on the inclusive last day.
    const endDate = formatInstantToNaive(new Date(end.getTime() - 1)).slice(0, 10);
    for (const userId of new Set(event.userIds)) {
      if (!memberSet.has(userId)) {
        continue;
      }
      const spans = collected.get(userId) ?? [];
      spans.push({ startDate, endDate });
      collected.set(userId, spans);
    }
  }

  for (const [userId, spans] of collected) {
    collected.set(userId, mergeSpans(spans));
  }
  return collected;
}

/** The minimal per-day group-status shape the breach-day collector needs. */
export interface BreachDayStatusLike {
  readonly date: string;
  readonly statuses: readonly { readonly groupId: string; readonly breached: boolean }[];
}

/**
 * Every breached day per group across a contiguous day scan, chronological —
 * the marked days behind each group card's month preview timeline. Pure; only
 * breached days are collected (clear days never mark a cell).
 */
export function breachDaysByGroup(perDay: readonly BreachDayStatusLike[]): Map<string, string[]> {
  const byGroup = new Map<string, string[]>();
  for (const day of perDay) {
    for (const status of day.statuses) {
      if (!status.breached) {
        continue;
      }
      const days = byGroup.get(status.groupId) ?? [];
      days.push(day.date);
      byGroup.set(status.groupId, days);
    }
  }
  return byGroup;
}

/**
 * The group's standing over the scanned window: an active period (one that
 * includes today) outranks an upcoming one; no period at all means clear.
 */
export function groupBreachState(
  episodes: readonly Pick<KahEpisodeRow, "status">[],
): KahGroupState {
  let upcoming = false;
  for (const episode of episodes) {
    if (episode.status === "active") {
      return "active";
    }
    if (episode.status === "upcoming") {
      upcoming = true;
    }
  }
  return upcoming ? "upcoming" : "clear";
}

/**
 * The group's lowest in-country percentage across its breach periods, with the
 * earliest day that hit it (ties keep the earlier day). Null when clear.
 */
export function groupWorst(
  episodes: readonly Pick<KahEpisodeRow, "worstPct" | "worstDate">[],
): { pct: number; date: string } | null {
  let worst: { pct: number; date: string } | null = null;
  for (const episode of episodes) {
    if (
      worst === null ||
      episode.worstPct < worst.pct ||
      (episode.worstPct === worst.pct && episode.worstDate < worst.date)
    ) {
      worst = { pct: episode.worstPct, date: episode.worstDate };
    }
  }
  return worst;
}

/** The earliest active/upcoming breach period start, or null when clear. */
export function groupNextBreachDate(
  episodes: readonly Pick<KahEpisodeRow, "status" | "startDate">[],
): string | null {
  let earliest: string | null = null;
  for (const episode of episodes) {
    if (episode.status === "resolved") {
      continue;
    }
    if (earliest === null || episode.startDate < earliest) {
      earliest = episode.startDate;
    }
  }
  return earliest;
}
