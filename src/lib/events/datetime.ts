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

/**
 * Shift a UTC-midnight all-day instant back to the SGT-midnight instant of the
 * same civil day (UTC+8 is ahead, so SGT midnight is 8 h earlier in UTC). Day-
 * based events are *stored* at UTC midnight (so `utcToDateString` round-trips
 * the date), but timed and half-day windows live on the SGT wall clock — this
 * realigns a full-day window onto that shared basis for overlap comparison.
 */
export function utcMidnightToSgt(date: Date): Date {
  return new Date(date.getTime() - APP_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
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

/** Add a signed number of days to a `YYYY-MM-DD` date. */
export function addDays(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return utcToDateString(new Date(Date.UTC(year, month - 1, day + days)));
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
 * Which day a calendar week starts on — a per-account preference stored in
 * `user_preferences.week_start` (see docs/ui-state.md). Every week/month grid
 * and the fetch set it implies derive from this.
 */
export type WeekStart = "monday" | "sunday";

export const WEEK_START_DEFAULT: WeekStart = "monday";

/** Coerce any stored/raw value to a valid {@link WeekStart} (default Monday). */
export function normalizeWeekStart(value: unknown): WeekStart {
  return value === "sunday" ? "sunday" : "monday";
}

/** Mantine's `firstDayOfWeek` value: 0 = Sunday, 1 = Monday. */
export function firstDayOfWeek(weekStart: WeekStart): 0 | 1 {
  return weekStart === "sunday" ? 0 : 1;
}

/**
 * Weekday abbreviations, Monday-first, matching `@mantine/schedule`'s default
 * `firstDayOfWeek: 1` + `weekdayFormat: "ddd"` (English). Do **not** reorder
 * this constant — the parade-email weekday picker indexes it as an ISO weekday.
 */
export const WEEKDAY_ABBREVIATIONS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * Weekday abbreviations in the order of the given week start, for the pinned
 * weekday-initials strip (`MonthWeekdayStrip`).
 */
export function weekdayAbbreviations(
  weekStart: WeekStart = WEEK_START_DEFAULT,
): readonly string[] {
  if (weekStart === "sunday") {
    return [WEEKDAY_ABBREVIATIONS[6], ...WEEKDAY_ABBREVIATIONS.slice(0, 6)];
  }
  return WEEKDAY_ABBREVIATIONS;
}

/**
 * The seven `YYYY-MM-DD` days of the week containing `dateOnly`, starting on
 * `weekStart` (matching the Mantine dates `firstDayOfWeek` used by the schedule
 * views). Weekends included.
 */
export function weekDays(dateOnly: string, weekStart: WeekStart = WEEK_START_DEFAULT): string[] {
  const [year, monthIndex, day] = dateOnly.split("-").map(Number);
  // JS `getUTCDay`: 0=Sun..6=Sat; offset from the chosen first day.
  const first = firstDayOfWeek(weekStart);
  const daysFromStart = (new Date(Date.UTC(year, monthIndex - 1, day)).getUTCDay() - first + 7) % 7;
  const start = Date.UTC(year, monthIndex - 1, day - daysFromStart);
  return Array.from({ length: 7 }, (_, i) => utcToDateString(new Date(start + i * 86_400_000)));
}

/** Shift a `YYYY-MM` month by a signed number of months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}

/**
 * Week rows the dashboard's Month view grid renders for `YYYY-MM`: the
 * `weekStart`-first weeks overlapping the month (4–6). Mantine's `MonthView` is
 * configured with `consistentWeeks={false}` + `withOutsideDays`, so no row is
 * ever padded in from wholly outside the month (the old `consistentWeeks`
 * default appended a full trailing week for 5-week months). Used by the
 * loading skeleton.
 */
export function monthGridRows(month: string, weekStart: WeekStart = WEEK_START_DEFAULT): number {
  const [year, monthIndex] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthIndex - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  // JS `getUTCDay`: 0=Sun..6=Sat; offset from the chosen first day.
  const daysFromStart = (first.getUTCDay() - firstDayOfWeek(weekStart) + 7) % 7;
  return Math.ceil((daysFromStart + daysInMonth) / 7);
}

/**
 * Every `YYYY-MM` month the Month view grid displays for `YYYY-MM`: the first
 * week-start day on or before the 1st through the last rendered week
 * (`monthGridRows`), so adjacent-month days rendered by `MonthView` carry
 * their events. 2–3 months depending on where the month's weeks fall.
 */
export function monthGridMonths(month: string, weekStart: WeekStart = WEEK_START_DEFAULT): string[] {
  const gridStart = weekDays(`${month}-01`, weekStart)[0];
  const gridEnd = addDays(gridStart, monthGridRows(month, weekStart) * 7 - 1);
  return monthsInRange(gridStart, gridEnd);
}

/** The last day of a `YYYY-MM` month, as `YYYY-MM-DD`. */
export function lastDayOfMonth(month: string): string {
  const [year, monthIndex] = month.split("-").map(Number);
  return utcToDateString(new Date(Date.UTC(year, monthIndex, 0)));
}

/** Every `YYYY-MM-DD` from start to end, inclusive (reversed range → empty). */
export function daysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    cursor = addOneDay(cursor);
  }
  return days;
}

/**
 * Whole calendar days from `fromNaive` to `targetNaive`, comparing date parts
 * only (so a target later the same day is `0` regardless of time). Clamped at
 * `0`: a target on or before `fromNaive`'s day yields `0`. Pure — the pinned
 * ticker's days-remaining countdown.
 */
export function daysUntilDate(fromNaive: string, targetNaive: string): number {
  const from = dateToUtc(fromNaive.slice(0, 10)).getTime();
  const target = dateToUtc(targetNaive.slice(0, 10)).getTime();
  return Math.max(0, Math.round((target - from) / 86_400_000));
}

/** Every `YYYY-MM` month a naive start/end range touches, inclusive. */
export function monthsInRange(startNaive: string, endNaive: string): string[] {
  // Wall-clock months from the date part: the UTC+8 instant of a midnight
  // `YYYY-MM-DD` lands on the previous UTC day, which would shift a range
  // starting on the 1st into the previous month.
  const [startYear, startMonth] = startNaive.slice(0, 7).split("-").map(Number);
  const [endYear, endMonth] = endNaive.slice(0, 7).split("-").map(Number);
  const months: string[] = [];
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const last = new Date(Date.UTC(endYear, endMonth - 1, 1));
  while (cursor <= last) {
    months.push(`${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  // Malformed ranges (end before start) still invalidate the start month.
  if (months.length === 0) {
    months.push(startNaive.slice(0, 7));
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

/**
 * Absolute instants a **read-model** naive start/end pair (`CalendarEvent`)
 * occupies on Google. Unlike {@link absEventRange}, the all-day `naiveEnd` is
 * already Google's *exclusive* end date (as stored by `mapCalendarItem`), so no
 * day is added — feeding it to `absEventRange` would shift the event one day too
 * far. Timed events parse exactly as in `absEventRange`.
 */
export function exclusiveAbsEventRange(
  naiveStart: string,
  naiveEnd: string,
  allDay: boolean,
): { start: Date; end: Date } {
  if (allDay) {
    return {
      start: dateToUtc(naiveStart.slice(0, 10)),
      end: dateToUtc(naiveEnd.slice(0, 10)),
    };
  }
  return { start: parseNaiveToInstant(naiveStart), end: parseNaiveToInstant(naiveEnd) };
}

/**
 * The 12-hour wall-clock offset of an AM/PM indicator within its day:
 * "AM" = `00:00:00`, "PM" = `12:00:00`.
 */
const HALF_OFFSETS: Record<string, number> = { AM: 0, PM: 1 };

/**
 * Absolute instants a half-day (`timeOption = "half"`) event occupies, honoring
 * the (AM)/(PM) indicators that `absEventRange` discards. It uses the shared
 * UTC+8 naive wall-clock and the same inclusive-date semantics as the form:
 * the start side begins at its day's half (AM = `00:00`, PM = `12:00`), and the
 * end side's *exclusive* last instant is its day's next boundary (AM = `12:00`,
 * PM = next-day `00:00`). So an AM-only event covers the morning
 * (`00:00`–`12:00`), a PM-only event the afternoon (`12:00`–`24:00`), individual
 * civil half-days never overlap, and a `PM`→`AM` pair tiles a full day back-to-back.
 *
 * Calls only make sense for day-based (`full`/`half`) events whose inclusive
 * dates are known; `startAmPm`/`endAmPm` absent on a side fall back to
 * `"AM"`/`"PM"` respectively (the full-day degradation).
 */
export function halfDayRange(
  startDate: string,
  endDate: string,
  startAmPm: string | null | undefined,
  endAmPm: string | null | undefined,
): { start: Date; end: Date } {
  const startHalf = startAmPm ? (HALF_OFFSETS[startAmPm] ?? 0) : 0;
  const endHalf = endAmPm ? (HALF_OFFSETS[endAmPm] ?? 1) : 1;
  const start = parseNaiveToInstant(`${startDate} ${startHalf === 1 ? "12:00:00" : "00:00:00"}`);
  const endDatePart = endHalf === 0 ? endDate : addOneDay(endDate);
  const end = parseNaiveToInstant(`${endDatePart} ${endHalf === 0 ? "12:00:00" : "00:00:00"}`);
  return { start, end };
}
