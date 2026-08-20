/**
 * Pure date/time helpers for the calendar events module. All wall-clock times
 * are interpreted in a fixed Singapore timezone (UTC+8, no DST), so the
 * conversions are deterministic and unit-testable without a timezone database.
 *
 * Convention: naive values are `YYYY-MM-DD HH:mm:ss` strings; date-only values
 * are `YYYY-MM-DD`. Google all-day events use an *exclusive* end date (the day
 * after the last day), which callers convert to/from inclusive form.
 */

export const APP_TIMEZONE = "Asia/Singapore";
export const APP_TIMEZONE_OFFSET_MINUTES = 8 * 60;

const pad = (value: number): string => String(value).padStart(2, "0");

/** Parse a naive `YYYY-MM-DD HH:mm:ss` string to an instant (UTC+8 wall clock). */
export function parseNaiveToInstant(naive: string): Date {
  const [datePart, timePart = "00:00:00"] = naive.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes, seconds] = timePart.split(":").map(Number);
  return new Date(
    Date.UTC(year, month - 1, day, hours - APP_TIMEZONE_OFFSET_MINUTES / 60, minutes, seconds),
  );
}

/** Format an instant (UTC `Date`) as a naive `YYYY-MM-DD HH:mm:ss` (UTC+8). */
export function formatInstantToNaive(date: Date): string {
  const shifted = new Date(date.getTime() + APP_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  return [
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`,
  ].join(" ");
}

/** A `YYYY-MM-DD` date as a UTC-midnight `Date` (Google all-day date). */
export function dateToUtc(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00Z`);
}

/** Format a UTC-midnight `Date` as `YYYY-MM-DD`. */
export function utcToDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Add one day to a `YYYY-MM-DD` date. */
export function addOneDay(dateOnly: string): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return utcToDateString(new Date(Date.UTC(year, month - 1, day + 1)));
}

/** Subtract one day from a `YYYY-MM-DD` date. */
export function subOneDay(dateOnly: string): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return utcToDateString(new Date(Date.UTC(year, month - 1, day - 1)));
}

/** First instant and exclusive end instant of a month (`YYYY-MM`), as UTC `Date`s. */
export function monthRange(month: string): { start: Date; end: Date } {
  const [year, monthIndex] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthIndex - 1, 1)),
    end: new Date(Date.UTC(year, monthIndex, 1)),
  };
}

/**
 * The seven `YYYY-MM-DD` days of the week containing `dateOnly`, Monday-first
 * (matching the Mantine dates default `firstDayOfWeek: 1` used by the schedule
 * views). Weekends included.
 */
export function weekDays(dateOnly: string): string[] {
  const [year, monthIndex, day] = dateOnly.split("-").map(Number);
  // JS `getUTCDay`: 0=Sun..6=Sat; offset from Monday, Mon=0..Sun=6.
  const daysFromMonday = (new Date(Date.UTC(year, monthIndex - 1, day)).getUTCDay() + 6) % 7;
  const monday = Date.UTC(year, monthIndex - 1, day - daysFromMonday);
  return Array.from({ length: 7 }, (_, i) => utcToDateString(new Date(monday + i * 86_400_000)));
}

/** Shift a `YYYY-MM` month by a signed number of months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}

/**
 * Full week rows a consistent 7-column month grid renders for `YYYY-MM`
 * (first weekday Sun=0..Sat=6, matching dayjs `.day()`). Used by the
 * dashboard's loading skeleton.
 */
export function monthGridRows(month: string): number {
  const [year, monthIndex] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthIndex - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return Math.ceil((first.getUTCDay() + daysInMonth) / 7);
}

/** Every `YYYY-MM` month a naive start/end range touches, inclusive. */
export function monthsInRange(startNaive: string, endNaive: string): string[] {
  const start = parseNaiveToInstant(startNaive);
  const end = parseNaiveToInstant(endNaive);
  const months: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= last) {
    months.push(`${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  // Malformed ranges (end before start) still invalidate the start month.
  if (months.length === 0) {
    months.push(`${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}`);
  }
  return months;
}

/**
 * Absolute instants a naive start/end pair occupies on Google: timed events are
 * the parsed UTC+8 wall clock; all-day events are the start date and the day
 * after the inclusive end date (Google's exclusive end-date convention).
 */
export function absEventRange(
  naiveStart: string,
  naiveEnd: string,
  allDay: boolean,
): { start: Date; end: Date } {
  if (allDay) {
    return {
      start: dateToUtc(naiveStart.slice(0, 10)),
      end: dateToUtc(addOneDay(naiveEnd.slice(0, 10))),
    };
  }
  return { start: parseNaiveToInstant(naiveStart), end: parseNaiveToInstant(naiveEnd) };
}
