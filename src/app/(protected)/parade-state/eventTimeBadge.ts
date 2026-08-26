import dayjs from "dayjs";

/** Minimal event shape needed to label an event's start–end span. */
export interface TimeBadgeEvent {
  start: string;
  end: string;
  allDay: boolean;
}

/**
 * Adaptive start–end label for an event's time badge, dropping the date from a
 * bound when it falls on the shown day. Timed: `8:00 AM – 12:00 PM`, or
 * `Aug 19, 10:00 PM – 2:00 AM` when a bound crosses days. All-day: `Aug 20`,
 * or `Aug 19 – Aug 21` for multi-day (the end is Google's exclusive date).
 */
export function formatEventTimeBadge(event: TimeBadgeEvent, shownDate: string): string {
  const start = dayjs(event.start);
  const end = dayjs(event.end);

  if (event.allDay) {
    const inclusiveEnd = end.subtract(1, "day");
    if (start.isSame(inclusiveEnd, "day")) {
      return start.format("MMM D");
    }
    return `${start.format("MMM D")} – ${inclusiveEnd.format("MMM D")}`;
  }

  const shown = dayjs(shownDate);
  const startLabel = start.isSame(shown, "day")
    ? start.format("h:mm A")
    : start.format("MMM D, h:mm A");
  const endLabel = end.isSame(shown, "day") ? end.format("h:mm A") : end.format("MMM D, h:mm A");
  return `${startLabel} – ${endLabel}`;
}