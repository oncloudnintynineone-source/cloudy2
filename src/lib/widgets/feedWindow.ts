/**
 * Window math for the calendar-feed subscription. Pure and I/O-free.
 *
 * The feed covers **±3 months**: the first day of the month three back through
 * the last day of the month three ahead. The read set adds the month before the
 * window so a multi-day event that started earlier still appears as ongoing.
 */

import { formatInstantToNaive, lastDayOfMonth, shiftMonth } from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";

import { eventEndDateInclusive } from "./shape";

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

/** Whether an event occupies at least one day in the feed window. */
export function eventInFeedWindow(event: CalendarEvent, window: WidgetFeedWindow): boolean {
  const startDate = event.start.slice(0, 10);
  const endDate = eventEndDateInclusive(event);
  return startDate <= window.endDate && endDate >= window.startDate;
}
