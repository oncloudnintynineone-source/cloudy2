/**
 * Window math for the calendar-feed subscription. Pure and I/O-free.
 *
 * The feed covers **±3 months**: the first day of the month three back through
 * the last day of the month three ahead. The read set adds the month before the
 * window so a multi-day event that started earlier still appears as ongoing.
 */

import {
  formatInstantToNaive,
  lastDayOfMonth,
  shiftMonth,
  subOneDay,
} from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";

export interface WidgetFeedWindow {
  /** First civil day included (`YYYY-MM-DD`). */
  startDate: string;
  /** Last civil day included (`YYYY-MM-DD`). */
  endDate: string;
  /** Months to read through the events cache (sorted, includes one extra prior month). */
  readMonths: string[];
}

export function widgetFeedWindow(now: Date = new Date()): WidgetFeedWindow {
  const currentMonth = formatInstantToNaive(now).slice(0, 7);
  const startMonth = shiftMonth(currentMonth, -3);
  const endMonth = shiftMonth(currentMonth, 3);
  const readMonths: string[] = [];
  for (let offset = -4; offset <= 3; offset += 1) {
    readMonths.push(shiftMonth(currentMonth, offset));
  }
  return {
    startDate: `${startMonth}-01`,
    endDate: lastDayOfMonth(endMonth),
    readMonths,
  };
}

/**
 * The last civil day an event occupies (inclusive). All-day / full / half-day
 * events store an exclusive UTC-midnight end, and a timed event ending exactly
 * at midnight occupies only the prior day — so both step back one day.
 */
export function eventEndDateInclusive(event: CalendarEvent): string {
  const startDate = event.start.slice(0, 10);
  const endDate = event.end.slice(0, 10);
  if (!startDate || !endDate) {
    return startDate;
  }
  const endTime = event.end.slice(11, 19);
  const civilBasis = event.payload.allDay || event.payload.timeOption !== "range";
  if (civilBasis || (endDate > startDate && endTime === "00:00:00")) {
    return subOneDay(endDate);
  }
  return endDate;
}

/** Whether an event occupies at least one day in the feed window. */
export function eventInFeedWindow(event: CalendarEvent, window: WidgetFeedWindow): boolean {
  const startDate = event.start.slice(0, 10);
  const endDate = eventEndDateInclusive(event);
  return startDate <= window.endDate && endDate >= window.startDate;
}
