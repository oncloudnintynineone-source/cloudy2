/**
 * Pure, I/O-free display helpers for clash / double-booking reports (the
 * wizard's review-step advisory and the Double Booking page). Kept out of the
 * `clashUi.tsx` component file so the label logic is unit-tested in the
 * node-env Vitest run. All naive values are `YYYY-MM-DD HH:mm:ss` UTC+8 wall
 * clock, matching `clashActions.ts`. See docs/user-clashes.md §1.8.
 */

import dayjs from "dayjs";

import { addDays, daysBetween, subOneDay } from "@/lib/events/datetime";

/** The subset of an entry the display helpers need. */
export interface ClashWindowLike {
  startNaive: string;
  endNaive: string;
  allDay: boolean;
}

/** The structured fields a clash entry exposes for type-first display. */
export interface ClashEntryDisplay {
  typeName: string | null;
  typeShortname: string | null;
  rawTitle: string | null;
  title: string;
  startNaive: string;
  endNaive: string;
  allDay: boolean;
  occupiesFullDay: boolean;
  effectiveStartNaive: string;
  effectiveEndNaive: string;
  timeOption: "range" | "full" | "half";
  startAmPm: "AM" | "PM" | null;
  endAmPm: "AM" | "PM" | null;
}

/** The `YYYY-MM-DD` date part of a naive datetime (or date). */
export function clashDayKey(naive: string): string {
  return naive.slice(0, 10);
}

/** An hour tick label for the timeline axis, e.g. `9 AM`, `1 PM`. */
export function formatAxisMinute(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;
  const period = hours < 12 ? "AM" : "PM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0
    ? `${hour12} ${period}`
    : `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/**
 * One cell per day across `[startDate, endDate]` (inclusive) with the number of
 * conflict episodes filed on it — the 30-day overview strip. Pure.
 */
export function buildClashDayStrip(
  startDate: string,
  endDate: string,
  conflictDayKeys: readonly string[],
): { dayKey: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const dayKey of conflictDayKeys) {
    counts.set(dayKey, (counts.get(dayKey) ?? 0) + 1);
  }
  return daysBetween(startDate, endDate).map((dayKey) => ({
    dayKey,
    count: counts.get(dayKey) ?? 0,
  }));
}

/**
 * The primary, scannable label for an entry: the event type shortname (the
 * code users recognise), falling back to the type name, then the raw title,
 * then the stored composite title. Keeps the code-heavy Google summary out of
 * the first line. See docs/user-clashes.md §1.8.
 */
export function clashTypeLabel(
  entry: Pick<ClashEntryDisplay, "typeShortname" | "typeName" | "rawTitle" | "title">,
): string {
  return (
    entry.typeShortname?.trim() ||
    entry.typeName?.trim() ||
    entry.rawTitle?.trim() ||
    entry.title
  );
}

/**
 * The episode's time heading (the card's first line), from the entries'
 * effective windows. Whole-day entries normalize to their civil-day bounds
 * (their effective end is exclusive), so an all-day episode reads `All day` or
 * a date range rather than a spurious midnight-to-midnight span.
 */
export function clashEpisodeTimeLabel(entries: readonly ClashEntryDisplay[]): string {
  if (entries.length === 0) {
    return "";
  }
  const timed = entries.filter((entry) => !entry.occupiesFullDay);
  if (timed.length === 0) {
    const firstDay = entries
      .map((entry) => clashDayKey(entry.effectiveStartNaive))
      .reduce((a, b) => (a < b ? a : b));
    const lastDay = entries
      .map((entry) => addDays(clashDayKey(entry.effectiveEndNaive), -1))
      .reduce((a, b) => (a > b ? a : b));
    return firstDay === lastDay
      ? "All day"
      : `${dayjs(firstDay).format("MMM D")} – ${dayjs(lastDay).format("MMM D")}`;
  }
  let start = timed[0].effectiveStartNaive;
  let end = timed[0].effectiveEndNaive;
  for (const entry of timed) {
    if (entry.effectiveStartNaive < start) {
      start = entry.effectiveStartNaive;
    }
    if (entry.effectiveEndNaive > end) {
      end = entry.effectiveEndNaive;
    }
  }
  const timedLabel = clashTimeLabel({ startNaive: start, endNaive: end, allDay: false });
  // A group with both a whole-day event and a timed one names both, so the
  // heading matches the timeline (which draws an all-day band *and* a bar).
  if (entries.some((entry) => entry.occupiesFullDay)) {
    return timedLabel === "All day" ? "All day" : `${timedLabel} · All day`;
  }
  return timedLabel;
}

/**
 * A date-free time label for one entry, using its effective occupancy window
 * (the day header supplies the date): `9:00 AM – 5:00 PM`, `All day`, `AM`/`PM`
 * for a half-day, or a date-qualified range when it crosses days.
 */
export function clashEntryTimeLabel(entry: ClashEntryDisplay): string {
  if (entry.occupiesFullDay) {
    return "All day";
  }
  if (entry.timeOption === "half") {
    const start = entry.startAmPm ?? "AM";
    const end = entry.endAmPm ?? "PM";
    return start === end ? start : `${start} – ${end}`;
  }
  const startDay = clashDayKey(entry.effectiveStartNaive);
  const endDay = clashDayKey(entry.effectiveEndNaive);
  const startTime = dayjs(entry.effectiveStartNaive).format("h:mm A");
  const endTime = dayjs(entry.effectiveEndNaive).format("h:mm A");
  if (startDay === endDay) {
    return `${startTime} – ${endTime}`;
  }
  return `${dayjs(entry.effectiveStartNaive).format("MMM D, h:mm A")} – ${dayjs(
    entry.effectiveEndNaive,
  ).format("MMM D, h:mm A")}`;
}

/** The effective-window fields needed to bucket an entry into days. */
export interface ClashEffectiveWindow {
  effectiveStartNaive: string;
  effectiveEndNaive: string;
  occupiesFullDay: boolean;
}

/**
 * The `YYYY-MM-DD` days an entry occupies. A whole-day entry's effective end is
 * exclusive (the next day's midnight), so its last covered day is one earlier.
 * Pure; drives the wizard's per-day timelines.
 */
export function clashCoveredDayKeys(entry: ClashEffectiveWindow): string[] {
  const first = clashDayKey(entry.effectiveStartNaive);
  const lastRaw = clashDayKey(entry.effectiveEndNaive);
  const last = entry.occupiesFullDay ? subOneDay(lastRaw) : lastRaw;
  return daysBetween(first, last);
}

/** The effective-window fields the day bucketing needs (a timeline entry maps
 * its `startNaive`/`endNaive` onto these). */
export interface ClashDayBucketInput {
  startNaive: string;
  endNaive: string;
  occupiesFullDay: boolean;
}

export interface ClashDayBucket {
  dayKey: string;
  /** Indices into the input array of the entries covering this day. */
  indices: number[];
}

/**
 * Bucket entries by the civil day(s) they cover, one bucket per day in
 * chronological order. `minEntries` drops days covered by fewer than that many
 * entries — the Double Booking page passes `2` so only genuine clash days
 * render (a multi-day all-day event passing through a day alone is not a
 * clash). A multi-day entry appears in every bucket it covers, so its band
 * repeats per clash day. Pure; drives `ClashTimelineDays`.
 */
export function clashDayBuckets(
  entries: readonly ClashDayBucketInput[],
  minEntries = 1,
): ClashDayBucket[] {
  const byDay = new Map<string, number[]>();
  entries.forEach((entry, index) => {
    const days = clashCoveredDayKeys({
      effectiveStartNaive: entry.startNaive,
      effectiveEndNaive: entry.endNaive,
      occupiesFullDay: entry.occupiesFullDay,
    });
    for (const dayKey of days) {
      const list = byDay.get(dayKey);
      if (list) {
        list.push(index);
      } else {
        byDay.set(dayKey, [index]);
      }
    }
  });
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .filter(([, indices]) => indices.length >= minEntries)
    .map(([dayKey, indices]) => ({ dayKey, indices }));
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
