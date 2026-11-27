/**
 * Pure display formatting for the KAH Status page: breach-period labels, group
 * state wording and member away-span sentences. Kept separate from the view and
 * from the date math so the exact copy is unit-tested rather than eyeballed.
 */

import dayjs from "dayjs";

import type { KahAwaySpan, KahEpisodeRow, KahGroupState } from "@/lib/kah/range";

/**
 * "Aug 12 – Aug 16" (year shown when the run crosses one). A run clipped at
 * the window start reads "Ongoing" (it began before today); one clipped at
 * the window end gets a "+" (it may extend past the look-ahead).
 */
export function periodLabel(
  episode: Pick<KahEpisodeRow, "startDate" | "endDate" | "clippedStart" | "clippedEnd">,
): string {
  const crossesYear = dayjs(episode.startDate).year() !== dayjs(episode.endDate).year();
  const fmt = (date: string) => dayjs(date).format(crossesYear ? "MMM D, YYYY" : "MMM D");
  const start = episode.clippedStart ? "Ongoing" : fmt(episode.startDate);
  const end = episode.clippedEnd ? `${fmt(episode.endDate)}+` : fmt(episode.endDate);
  return `${start} – ${end}`;
}

/** The group card's state pill wording. */
export function groupStateLabel(state: KahGroupState): string {
  if (state === "active") {
    return "Breaching now";
  }
  if (state === "upcoming") {
    return "Breach upcoming";
  }
  return "All clear";
}

/** Format a span's endpoints, adding the year only when the span crosses one. */
function spanDates(span: KahAwaySpan): { start: string; end: string } {
  const crossesYear = dayjs(span.startDate).year() !== dayjs(span.endDate).year();
  const fmt = (date: string) => dayjs(date).format(crossesYear ? "MMM D, YYYY" : "MMM D");
  return { start: fmt(span.startDate), end: fmt(span.endDate) };
}

/**
 * One member-away sentence: an in-progress trip reads "Away now · until Sep
 * 16" ("Away today" when it ends today); a future one reads "Next away Sep 12 –
 * Sep 16". Spans are already clipped to the scanned window.
 */
export function awaySpanLabel(span: KahAwaySpan, todayKey: string): string {
  const { start, end } = spanDates(span);
  const current = span.startDate <= todayKey && todayKey <= span.endDate;
  if (current) {
    if (span.startDate === todayKey && span.endDate === todayKey) {
      return "Away today";
    }
    return `Away now · until ${end}`;
  }
  return span.startDate === span.endDate ? `Next away ${start}` : `Next away ${start} – ${end}`;
}

/**
 * The nearest away stretch worth naming on a roster row (the current trip, or
 * the next one) plus how many later trips follow it.
 */
export function awaySpanSummary(
  spans: readonly KahAwaySpan[],
  todayKey: string,
): { label: string; more: number } | null {
  const relevant = spans.filter((span) => span.endDate >= todayKey);
  const first = relevant[0];
  if (!first) {
    return null;
  }
  return { label: awaySpanLabel(first, todayKey), more: relevant.length - 1 };
}
