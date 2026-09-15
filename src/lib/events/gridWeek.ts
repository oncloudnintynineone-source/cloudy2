/**
 * Pure helpers for the Week (Grid) view's all-day strip.
 *
 * Mantine's `WeekView` lays all-day events out in a fixed-height strip whose
 * chips are half the strip tall, so only the first two lanes are ever visible;
 * the rest are clipped and only revealed transiently on hover (never on touch).
 * This module mirrors the library's all-day classification and its greedy lane
 * assignment so the view can identify the events that fall into the hidden
 * lanes and surface them behind a "+N more" popover instead.
 *
 * Kept free of I/O and React so the binning is unit-tested without a DOM.
 */

import dayjs from "dayjs";

import type { CalendarEvent } from "./queries";

/** All-day lanes the fixed-height strip renders before clipping (48px / 24px). */
export const GRID_WEEK_ALLDAY_VISIBLE_LANES = 2;

export interface GridWeekAllDayLayout {
  /** Lanes needed to show every all-day event (0 when there are none). */
  laneCount: number;
  /** Events assigned to a hidden lane (lane >= visibleLanes), chronological. */
  hidden: CalendarEvent[];
  /** Ids of the hidden events, for the grid's chip suppression. */
  hiddenIds: Set<string>;
}

const EMPTY_LAYOUT: GridWeekAllDayLayout = {
  laneCount: 0,
  hidden: [],
  hiddenIds: new Set(),
};

/**
 * Mantine's inclusive end day: the day before an exclusive (midnight) end,
 * otherwise the end's own day.
 */
function endDateInclusive(end: string): dayjs.Dayjs {
  const value = dayjs(end);
  const day = value.startOf("day");
  return value.hour() === 0 && value.minute() === 0 ? day.subtract(1, "day") : day;
}

/** A single visible day on which the event reads as a whole-day event. */
function isWholeDayOn(event: CalendarEvent, day: string): boolean {
  const dayStart = dayjs(day).startOf("day");
  const nextDayStart = dayStart.add(1, "day");
  const sameDayEnd = nextDayStart.subtract(1, "second");
  const start = dayjs(event.start);
  const end = dayjs(event.end);
  return start.isSame(dayStart) && (end.isSame(nextDayStart) || end.isSame(sameDayEnd));
}

/**
 * Whether Mantine places the event in the all-day strip for the given visible
 * week. Mirrors the library's `allDay = isMultiday || isActuallyAllDay`: a
 * multi-day timed event shares the strip, while a half-day event
 * (00:00–12:00 / 12:00–24:00) stays on the timed grid. Events that don't
 * intersect the week are excluded.
 */
function isAllDayForWeek(event: CalendarEvent, days: readonly string[]): boolean {
  const startDay = dayjs(event.start).startOf("day");
  const actualEnd = endDateInclusive(event.end);
  const weekDays = days.filter((day) => {
    const dayStart = dayjs(day).startOf("day");
    return !dayStart.isBefore(startDay) && !dayStart.isAfter(actualEnd);
  });
  if (weekDays.length === 0) {
    return false;
  }
  return actualEnd.isAfter(startDay) || weekDays.some((day) => isWholeDayOn(event, day));
}

/** Half-open instant overlap, matching Mantine's `isEventsOverlap`. */
function overlaps(a: CalendarEvent, b: CalendarEvent): boolean {
  const aStart = dayjs(a.start).valueOf();
  const aEnd = dayjs(a.end).valueOf();
  const bStart = dayjs(b.start).valueOf();
  return aStart < dayjs(b.end).valueOf() && bStart < aEnd;
}

/**
 * Lane the all-day events of `days` occupy in the Week (Grid) strip, plus the
 * ones that land in a hidden lane. The lane assignment mirrors Mantine's
 * `sortEvents` + greedy `assignEventRows` so `hidden` matches exactly what the
 * library clips.
 */
export function gridWeekAllDayLayout(
  events: readonly CalendarEvent[],
  days: readonly string[],
  visibleLanes = GRID_WEEK_ALLDAY_VISIBLE_LANES,
): GridWeekAllDayLayout {
  if (days.length === 0) {
    return EMPTY_LAYOUT;
  }
  const allDay = events.filter((event) => isAllDayForWeek(event, days));
  // sortEvents: start ascending, then longer events first.
  const sorted = allDay.slice().sort((a, b) => {
    const startDiff = dayjs(a.start).diff(dayjs(b.start));
    if (startDiff !== 0) {
      return startDiff;
    }
    return dayjs(b.end).diff(dayjs(b.start)) - dayjs(a.end).diff(dayjs(a.start));
  });
  const rows: { event: CalendarEvent; row: number }[] = [];
  for (const event of sorted) {
    let row = 0;
    while (rows.some((entry) => entry.row === row && overlaps(entry.event, event))) {
      row++;
    }
    rows.push({ event, row });
  }
  const laneCount = rows.reduce((max, entry) => Math.max(max, entry.row + 1), 0);
  const hidden = rows.filter((entry) => entry.row >= visibleLanes).map((entry) => entry.event);
  return {
    laneCount,
    hidden,
    hiddenIds: new Set(hidden.map((event) => event.id)),
  };
}
