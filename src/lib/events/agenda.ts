/**
 * Pure helpers for the dashboard's Agenda views (the Agenda tab and the
 * Month-view day modal). Kept free of I/O for unit testing.
 */

import { addOneDay, parseNaiveToInstant } from "./datetime";
import type { CalendarEvent } from "./queries";

/**
 * The events of `events` that occupy the day `dateOnly` (`YYYY-MM-DD`).
 *
 * Each event's interval is half-open `[start, end)` — all-day events carry the
 * exclusive end date (the day after the last day), timed events their naive
 * wall clock — so an event occupies `dateOnly` exactly when
 * `start < next-day-midnight` and `end > day-midnight`. Filtering here, rather
 * than trusting `@mantine/schedule`'s AgendaView `rangeStart`/`rangeEnd` alone,
 * is required because its day-granularity end check (`end.startOfDay() >=
 * rangeStart`) lets a previous-day all-day event through (its exclusive end
 * lands exactly on the selected day's midnight) and it would then be grouped
 * under the previous day's date header.
 */
export function eventsOnDay(events: CalendarEvent[], dateOnly: string): CalendarEvent[] {
  const dayStart = parseNaiveToInstant(`${dateOnly} 00:00:00`);
  const dayEnd = parseNaiveToInstant(`${addOneDay(dateOnly)} 00:00:00`);
  return events.filter((event) => {
    const start = parseNaiveToInstant(event.start);
    const end = parseNaiveToInstant(event.end);
    return end > dayStart && start < dayEnd;
  });
}
