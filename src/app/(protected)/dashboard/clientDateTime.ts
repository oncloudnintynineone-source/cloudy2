"use client";

import dayjs from "dayjs";

/** Parse a naive `YYYY-MM-DD HH:mm:ss` string to a local `Date` (for pickers). */
export function naiveToDate(naive: string): Date | null {
  if (!naive) {
    return null;
  }
  const [datePart, timePart] = naive.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes, seconds] = (timePart ?? "00:00:00").split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

/** Human-friendly rendering of a naive datetime (or date, for all-day events). */
export function formatDateTime(naive: string, allDay: boolean): string {
  const date = naiveToDate(naive);
  if (!date) {
    return "";
  }
  return allDay ? dayjs(date).format("MMM D, YYYY") : dayjs(date).format("MMM D, YYYY h:mm A");
}

/**
 * Week range label, e.g. `Aug 18 – 24, 2026`, `Jun 29 – Jul 5, 2026` (the year
 * only where the month or year changes), or `Dec 29, 2025 – Jan 4, 2026` when
 * the week spans two years, matching the dates context `labelSeparator`.
 */
export function formatWeekLabel(weekStart: string, weekEnd: string): string {
  const start = dayjs(weekStart);
  const end = dayjs(weekEnd);
  const startPart = start.isSame(end, "year")
    ? start.format("MMM D")
    : start.format("MMM D, YYYY");
  const endPart =
    start.isSame(end, "year") && start.isSame(end, "month")
      ? end.format("D, YYYY")
      : end.format("MMM D, YYYY");
  return `${startPart} – ${endPart}`;
}
