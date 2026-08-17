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
