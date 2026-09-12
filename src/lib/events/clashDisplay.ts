/**
 * Pure, I/O-free display helpers for clash / double-booking reports (the
 * wizard's review-step advisory and the Double Booking page). Kept out of the
 * `clashUi.tsx` component file so the label logic is unit-tested in the
 * node-env Vitest run. All naive values are `YYYY-MM-DD HH:mm:ss` UTC+8 wall
 * clock, matching `clashActions.ts`. See docs/user-clashes.md §1.8.
 */

import dayjs from "dayjs";

import { addDays } from "@/lib/events/datetime";

/** The subset of an entry the display helpers need. */
export interface ClashWindowLike {
  startNaive: string;
  endNaive: string;
  allDay: boolean;
}

/** The `YYYY-MM-DD` date part of a naive datetime (or date). */
export function clashDayKey(naive: string): string {
  return naive.slice(0, 10);
}

/** A short day heading: `Today` / `Tomorrow` / `Mon 14 Sep`. */
export function clashDayLabel(dayKey: string, todayKey: string): string {
  if (dayKey === todayKey) {
    return "Today";
  }
  if (dayKey === addDays(todayKey, 1)) {
    return "Tomorrow";
  }
  return dayjs(dayKey).format("ddd D MMM");
}

/**
 * An all-day entry's inclusive end date (`YYYY-MM-DD 00:00:00`) really occupies
 * through the end of that civil day; normalize its end to the day's last
 * instant so an episode span that mixes all-day and timed events is correct.
 */
function spanStart(entry: ClashWindowLike): string {
  return entry.allDay ? `${clashDayKey(entry.startNaive)} 00:00:00` : entry.startNaive;
}

function spanEnd(entry: ClashWindowLike): string {
  return entry.allDay ? `${clashDayKey(entry.endNaive)} 23:59:59` : entry.endNaive;
}

/**
 * The episode window covering a whole group: earliest start → latest end, with
 * all-day ends normalized to end-of-day. Naive strings compare correctly
 * because they are zero-padded.
 */
export function clashEpisodeWindow(entries: readonly ClashWindowLike[]): ClashWindowLike {
  const first = entries[0];
  let start = spanStart(first);
  let end = spanEnd(first);
  let allDay = first.allDay;
  for (const entry of entries) {
    const candidateStart = spanStart(entry);
    const candidateEnd = spanEnd(entry);
    if (candidateStart < start) {
      start = candidateStart;
    }
    if (candidateEnd > end) {
      end = candidateEnd;
    }
    allDay = allDay && entry.allDay;
  }
  return { startNaive: start, endNaive: end, allDay };
}

/**
 * A compact time-first label for a card heading (the day is already shown by
 * the surrounding day header): `9:00 AM – 11:30 AM`, `All day`, or a
 * date-qualified range when the episode crosses days.
 */
export function clashTimeLabel(window: ClashWindowLike): string {
  if (!window.startNaive || !window.endNaive) {
    return "";
  }
  const startDay = clashDayKey(window.startNaive);
  const endDay = clashDayKey(window.endNaive);
  if (window.allDay) {
    return startDay === endDay
      ? "All day"
      : `${dayjs(startDay).format("MMM D")} – ${dayjs(endDay).format("MMM D")}`;
  }
  if (startDay === endDay) {
    const startTime = dayjs(window.startNaive).format("h:mm A");
    const endTime = dayjs(window.endNaive).format("h:mm A");
    if (startTime === "12:00 AM" && endTime === "11:59 PM") {
      return "All day";
    }
    return `${startTime} – ${endTime}`;
  }
  return `${dayjs(window.startNaive).format("MMM D, h:mm A")} – ${dayjs(
    window.endNaive,
  ).format("MMM D, h:mm A")}`;
}

/**
 * Human window label for one entry (all-day ends arrive as inclusive naive
 * dates). Collapses a same-day timed range to a single date:
 * `Sep 14, 2026 9:00 AM – 11:30 AM`, or `Sep 14 – 16, 2026` for all-day spans.
 * Shared by the wizard's review-step advisory and the Double Booking page.
 */
export function clashWhenLabel(entry: ClashWindowLike): string {
  if (!entry.startNaive) {
    return "";
  }
  const startDay = clashDayKey(entry.startNaive);
  const endDay = clashDayKey(entry.endNaive);
  if (entry.allDay) {
    if (!entry.endNaive || startDay === endDay) {
      return dayjs(startDay).format("MMM D, YYYY");
    }
    return `${dayjs(startDay).format("MMM D")} – ${dayjs(endDay).format("MMM D, YYYY")}`;
  }
  const startTime = dayjs(entry.startNaive).format("h:mm A");
  const endTime = dayjs(entry.endNaive).format("h:mm A");
  if (!entry.endNaive || startDay === endDay) {
    return `${dayjs(startDay).format("MMM D, YYYY")} ${startTime} – ${endTime}`;
  }
  return `${dayjs(entry.startNaive).format("MMM D, YYYY h:mm A")} – ${dayjs(
    entry.endNaive,
  ).format("MMM D, YYYY h:mm A")}`;
}
