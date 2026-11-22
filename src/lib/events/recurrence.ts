/**
 * Pure recurrence rules for repeating events. The app mirrors Google Calendar's
 * four base frequencies (daily / weekly / monthly / yearly) with an interval and
 * a duration (forever, a number of occurrences, or an inclusive end date).
 *
 * The wire format is a Google `RRULE` line; the app keeps a compact
 * {@link RecurrenceRule} in the event notes so a read can prefill/summarise
 * without fetching the recurring parent. Everything here is I/O-free and
 * unit-tested, including the date expansion used for "this and following"
 * splits, the KAH look-ahead and the deep-link occurrence lookup.
 *
 * Wall-clock semantics are the app's fixed UTC+8 (`Asia/Singapore`) model: an
 * occurrence shares the series start's time-of-day, and all comparisons are on
 * `YYYY-MM-DD` civil dates.
 */

import {
  addDays,
  dateToUtc,
  formatInstantToNaive,
  parseNaiveToInstant,
  utcToDateString,
} from "./datetime";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceRule {
  freq: RecurrenceFrequency;
  /** 1…99. */
  interval: number;
  /** Weekly only: 0 = Sunday … 6 = Saturday, sorted, deduped. */
  byWeekday?: number[];
  /** Number of occurrences (including the first), 2…999. Mutually exclusive with `until`. */
  count?: number | null;
  /** Inclusive last occurrence date (`YYYY-MM-DD`). Mutually exclusive with `count`. */
  until?: string | null;
}

export const MAX_RECURRENCE_INTERVAL = 99;
export const MAX_RECURRENCE_COUNT = 999;
export const MAX_UNTIL_YEARS = 50;
/** How far a Forever series' exceptions are scanned for split/rule cleanup. */
export const EXCEPTION_SCAN_HORIZON_YEARS = 10;

const DAY_MS = 86_400_000;
const MAX_EXPANSION_ITERATIONS = 200_000;

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
/** Sunday-first labels, matching {@link WEEKDAY_CODES} / JS `getUTCDay`. */
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Monday-first labels for the weekly picker. */
export const WEEKDAY_PICKER_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const FREQUENCIES: readonly RecurrenceFrequency[] = ["daily", "weekly", "monthly", "yearly"];
const SIMPLE_RRULE_KEYS = new Set([
  "FREQ",
  "INTERVAL",
  "BYDAY",
  "COUNT",
  "UNTIL",
  "WKST",
  "BYMONTHDAY",
]);

function isFrequency(value: unknown): value is RecurrenceFrequency {
  return typeof value === "string" && (FREQUENCIES as readonly string[]).includes(value);
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  return utcToDateString(dateToUtc(value)) === value;
}

function isRealDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** JS weekday of a civil date (0 = Sunday). */
export function weekdayOf(dateOnly: string): number {
  return dateToUtc(dateOnly.slice(0, 10)).getUTCDay();
}

function civilParts(dateOnly: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateOnly.slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

function makeCivilDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return utcToDateString(date);
}

function startOfWeekSunday(dateOnly: string): string {
  return addDays(dateOnly, -weekdayOf(dateOnly));
}

function wholeDaysBetween(from: string, to: string): number {
  return Math.round((dateToUtc(to).getTime() - dateToUtc(from).getTime()) / DAY_MS);
}

function normalizeByWeekday(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const days = new Set<number>();
  for (const entry of value) {
    if (typeof entry === "number" && Number.isInteger(entry) && entry >= 0 && entry <= 6) {
      days.add(entry);
    }
  }
  return [...days].sort((a, b) => a - b);
}

function normalizeInterval(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }
  return Math.min(MAX_RECURRENCE_INTERVAL, Math.max(1, Math.trunc(value)));
}

function normalizeCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const count = Math.trunc(value);
  if (count < 2) {
    return null;
  }
  return Math.min(MAX_RECURRENCE_COUNT, count);
}

function normalizeUntil(value: unknown): string | null {
  return isDateOnly(value) ? value : null;
}

/**
 * Coerce an untrusted recurrence value into a valid rule, or null for "does not
 * repeat". Used by the server write path so a stale/forged client payload can
 * never persist an invalid rule. Weekly rules always include the start date's
 * weekday (the series anchor is the first occurrence).
 */
export function normalizeRecurrence(raw: unknown, startNaive: string): RecurrenceRule | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const value = raw as Partial<RecurrenceRule> & Record<string, unknown>;
  if (!isFrequency(value.freq)) {
    return null;
  }
  const startDate = startNaive.slice(0, 10);
  const interval = normalizeInterval(value.interval);
  const count = normalizeCount(value.count);
  const until = normalizeUntil(value.until);
  const rule: RecurrenceRule = { freq: value.freq, interval };
  if (value.freq === "weekly") {
    const selected = new Set(normalizeByWeekday(value.byWeekday));
    if (isDateOnly(startDate)) {
      selected.add(weekdayOf(startDate));
    }
    if (selected.size > 0) {
      rule.byWeekday = [...selected].sort((a, b) => a - b);
    }
  }
  // On the wire a rule has at most one duration bound. Prefer an explicit end
  // date (the more restrictive form) and otherwise keep the count.
  if (until && (!isDateOnly(startDate) || until >= startDate)) {
    rule.until = until;
  } else if (count !== null) {
    rule.count = count;
  }
  return rule;
}

/**
 * Validate a user-entered rule. Returns the first error message, or null when
 * valid. `null`/`undefined` means "does not repeat" and is always valid.
 */
export function validateRecurrence(raw: unknown, startNaive: string): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return "Choose how the event repeats";
  }
  const value = raw as Partial<RecurrenceRule> & Record<string, unknown>;
  if (!isFrequency(value.freq)) {
    return "Choose how often the event repeats";
  }
  if (!isDateOnly(startNaive.slice(0, 10))) {
    return "Choose the start date first";
  }
  const startDate = startNaive.slice(0, 10);
  const interval = value.interval;
  if (
    typeof interval !== "number" ||
    !Number.isInteger(interval) ||
    interval < 1 ||
    interval > MAX_RECURRENCE_INTERVAL
  ) {
    return `Repeat interval must be a whole number between 1 and ${MAX_RECURRENCE_INTERVAL}`;
  }
  if (value.freq === "weekly") {
    const days = normalizeByWeekday(value.byWeekday);
    if (days.length === 0) {
      return "Select at least one day of the week";
    }
    if (!days.includes(weekdayOf(startDate))) {
      return "Keep the start day selected for a weekly repeat";
    }
  }
  const hasCount = value.count !== null && value.count !== undefined;
  const hasUntil = value.until !== null && value.until !== undefined && value.until !== "";
  if (hasCount && hasUntil) {
    return "Choose either a number of occurrences or an end date";
  }
  if (hasCount) {
    if (
      typeof value.count !== "number" ||
      !Number.isInteger(value.count) ||
      value.count < 2 ||
      value.count > MAX_RECURRENCE_COUNT
    ) {
      return `Number of occurrences must be between 2 and ${MAX_RECURRENCE_COUNT}`;
    }
  }
  if (hasUntil) {
    if (!isDateOnly(value.until)) {
      return "Enter a valid end date";
    }
    if (value.until < startDate) {
      return "End of repeat must be on or after the first occurrence";
    }
    const maxUntil = `${Number(startDate.slice(0, 4)) + MAX_UNTIL_YEARS}${startDate.slice(4)}`;
    if (value.until > maxUntil) {
      return `End of repeat must be within ${MAX_UNTIL_YEARS} years`;
    }
  }
  return null;
}

/** Compact UTC `YYYYMMDDTHHmmssZ` for an instant. */
function utcCompact(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`,
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`,
  ].join("");
}

/**
 * The `RRULE:` line for a normalized rule. Timed series end at the inclusive
 * end-of-day in SGT (the last instant of the `until` date); all-day series use
 * Google's date-only `UNTIL` form.
 */
export function recurrenceToRRule(
  rule: RecurrenceRule,
  startNaive: string,
  allDay: boolean,
): string {
  const startDate = startNaive.slice(0, 10);
  const parts = [`FREQ=${rule.freq.toUpperCase()}`, `INTERVAL=${rule.interval}`];
  if (rule.freq === "weekly") {
    const days = rule.byWeekday?.length ? rule.byWeekday : [weekdayOf(startDate)];
    parts.push(`BYDAY=${days.map((day) => WEEKDAY_CODES[day]).join(",")}`);
  }
  if (rule.freq === "monthly") {
    parts.push(`BYMONTHDAY=${Number(startDate.slice(8, 10))}`);
  }
  if (typeof rule.count === "number" && rule.count >= 2) {
    parts.push(`COUNT=${rule.count}`);
  } else if (rule.until) {
    if (allDay) {
      parts.push(`UNTIL=${rule.until.replace(/-/g, "")}`);
    } else {
      const endOfDay = parseNaiveToInstant(`${rule.until} 23:59:59`);
      parts.push(`UNTIL=${utcCompact(endOfDay)}`);
    }
  }
  return `RRULE:${parts.join(";")}`;
}

export interface ParsedRecurrence {
  /** Best-effort parsed rule (null when no usable RRULE). */
  rule: RecurrenceRule | null;
  /** False when the rule uses a pattern this app cannot safely rewrite. */
  supported: boolean;
  /** Non-RRULE recurrence lines (EXDATE/RDATE), preserved on series edits. */
  extraLines: string[];
  /** The raw RRULE line, when present. */
  raw: string | null;
}

/** Parse Google recurrence lines into the app's supported subset. */
export function parseRRule(recurrence: string[] | null | undefined): ParsedRecurrence {
  const lines = Array.isArray(recurrence) ? recurrence.filter((line) => typeof line === "string") : [];
  const rruleLines = lines.filter((line) => line.trim().toUpperCase().startsWith("RRULE:"));
  const extraLines = lines.filter((line) => !line.trim().toUpperCase().startsWith("RRULE:"));
  if (rruleLines.length !== 1) {
    return { rule: null, supported: false, extraLines, raw: rruleLines[0] ?? null };
  }
  const raw = rruleLines[0];
  const body = raw.slice(raw.indexOf(":") + 1);
  const fields = new Map<string, string>();
  let supported = true;
  for (const part of body.split(";")) {
    const [keyRaw, valueRaw] = part.split("=");
    if (!keyRaw || !valueRaw) {
      continue;
    }
    const key = keyRaw.trim().toUpperCase();
    const value = valueRaw.trim();
    if (!SIMPLE_RRULE_KEYS.has(key)) {
      supported = false;
    }
    fields.set(key, value);
  }
  const freqValue = fields.get("FREQ")?.toLowerCase();
  if (!isFrequency(freqValue)) {
    return { rule: null, supported: false, extraLines, raw };
  }
  const interval = Number(fields.get("INTERVAL") ?? "1");
  const rule: RecurrenceRule = {
    freq: freqValue,
    interval:
      Number.isInteger(interval) && interval >= 1
        ? Math.min(interval, MAX_RECURRENCE_INTERVAL)
        : 1,
  };
  if (freqValue === "weekly") {
    const byday = fields.get("BYDAY");
    if (byday) {
      const days = byday
        .split(",")
        .map((code) =>
          WEEKDAY_CODES.indexOf(code.trim().toUpperCase() as (typeof WEEKDAY_CODES)[number]),
        )
        .filter((day) => day >= 0);
      if (days.length > 0) {
        rule.byWeekday = [...new Set(days)].sort((a, b) => a - b);
      }
    }
    // A weekly rule without BYDAY is valid; the caller normalizes it from the
    // series start. Other day selectors cannot be represented in the app rule.
    if (fields.has("BYMONTHDAY") || fields.has("BYMONTH") || fields.has("BYSETPOS")) {
      supported = false;
    }
  }
  if (fields.has("COUNT")) {
    const count = Number(fields.get("COUNT"));
    if (Number.isInteger(count) && count >= 2) {
      rule.count = count;
    } else {
      supported = false;
    }
  }
  if (fields.has("UNTIL")) {
    const untilRaw = fields.get("UNTIL")!;
    const dateOnly = untilRaw.slice(0, 8);
    if (/^\d{8}$/.test(dateOnly)) {
      const formatted = `${dateOnly.slice(0, 4)}-${dateOnly.slice(4, 6)}-${dateOnly.slice(6, 8)}`;
      if (isRealDate(formatted)) {
        rule.until = formatted;
      } else {
        supported = false;
      }
    } else {
      supported = false;
    }
    // A UTC UNTIL may legally sit on the previous SGT date; use the SGT date of
    // the instant so a day-boundary rule still includes its last occurrence.
    if (untilRaw.length > 8 && untilRaw.endsWith("Z")) {
      const compact = untilRaw.replace(/[^0-9TZ]/g, "");
      const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(compact);
      if (match) {
        const instant = new Date(
          Date.UTC(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
            Number(match[4]),
            Number(match[5]),
            Number(match[6]),
          ),
        );
        rule.until = formatInstantToNaive(instant).slice(0, 10);
      }
    }
  }
  return { rule, supported, extraLines, raw };
}

/** Monday-first human label for a weekday index. */
export function weekdayLabel(day: number): string {
  return WEEKDAY_LABELS[day] ?? "";
}

function formatHumanDate(dateOnly: string): string {
  const { year, month, day } = civilParts(dateOnly);
  return `${day} ${MONTH_LABELS[month - 1] ?? ""} ${year}`.trim();
}

/** Human summary used on the review step, detail modal and audit snapshots. */
export function recurrenceSummary(rule: RecurrenceRule, startNaive?: string): string {
  const interval = rule.interval;
  const startDate = startNaive?.slice(0, 10) ?? "";
  const every = interval === 1 ? "Every" : `Every ${interval}`;
  let text: string;
  switch (rule.freq) {
    case "daily":
      text = interval === 1 ? "Every day" : `Every ${interval} days`;
      break;
    case "weekly": {
      const days = (rule.byWeekday ?? (isDateOnly(startDate) ? [weekdayOf(startDate)] : []))
        .slice()
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
        .map((day) => weekdayLabel(day));
      text = `${every} ${interval === 1 ? "week" : "weeks"}${days.length ? ` on ${days.join(", ")}` : ""}`;
      break;
    }
    case "monthly": {
      const day = startDate ? Number(startDate.slice(8, 10)) : null;
      text = `${every} ${interval === 1 ? "month" : "months"}${day ? ` on day ${day}` : ""}`;
      break;
    }
    case "yearly": {
      if (startDate) {
        const { month, day } = civilParts(startDate);
        text = `${every} ${interval === 1 ? "year" : "years"} on ${day} ${MONTH_LABELS[month - 1]}`;
      } else {
        text = `${every} ${interval === 1 ? "year" : "years"}`;
      }
      break;
    }
  }
  if (typeof rule.count === "number") {
    return `${text} · ${rule.count} ${rule.count === 1 ? "time" : "times"}`;
  }
  if (rule.until) {
    return `${text} · until ${formatHumanDate(rule.until)}`;
  }
  return `${text} · forever`;
}

/**
 * Raw occurrence dates in chronological order, honouring the interval/weekday
 * pattern but not count/until (callers apply those while counting so a
 * later-window query still knows an occurrence's index).
 */
function rawOccurrenceDates(
  rule: RecurrenceRule,
  startDate: string,
  upToDate: string,
): string[] {
  const dates: string[] = [];
  const start = civilParts(startDate);
  let iterations = 0;
  const push = (date: string | null) => {
    if (date && date >= startDate) {
      dates.push(date);
    }
  };

  if (rule.freq === "daily") {
    for (let i = 0; iterations < MAX_EXPANSION_ITERATIONS; i += 1, iterations += 1) {
      const candidate = addDays(startDate, i * rule.interval);
      if (candidate > upToDate || dates.length >= MAX_EXPANSION_ITERATIONS) {
        break;
      }
      push(candidate);
    }
    return dates;
  }

  if (rule.freq === "weekly") {
    const weekdays = rule.byWeekday?.length ? rule.byWeekday : [weekdayOf(startDate)];
    const selected = new Set(weekdays);
    const weekStart = startOfWeekSunday(startDate);
    for (
      let cursor = startDate;
      iterations < MAX_EXPANSION_ITERATIONS && cursor <= upToDate;
      cursor = addDays(cursor, 1), iterations += 1
    ) {
      if (!selected.has(weekdayOf(cursor))) {
        continue;
      }
      const weekIndex = Math.floor(wholeDaysBetween(weekStart, cursor) / 7);
      if (weekIndex % rule.interval !== 0) {
        continue;
      }
      push(cursor);
    }
    return dates;
  }

  if (rule.freq === "monthly") {
    const startMonthIndex = start.year * 12 + (start.month - 1);
    const upTo = civilParts(upToDate);
    const upToMonthIndex = upTo.year * 12 + (upTo.month - 1);
    for (let k = 0; iterations < MAX_EXPANSION_ITERATIONS; k += 1, iterations += 1) {
      const monthIndex = startMonthIndex + k * rule.interval;
      if (monthIndex > upToMonthIndex) {
        break;
      }
      const year = Math.floor(monthIndex / 12);
      const month = (monthIndex % 12) + 1;
      push(makeCivilDate(year, month, start.day));
    }
    return dates;
  }

  for (let k = 0; iterations < MAX_EXPANSION_ITERATIONS; k += 1, iterations += 1) {
    const year = start.year + k * rule.interval;
    const candidate = makeCivilDate(year, start.month, start.day);
    if (candidate && candidate > upToDate) {
      break;
    }
    if (year > Number(upToDate.slice(0, 4)) + 1) {
      break;
    }
    push(candidate);
  }
  return dates;
}

/** Dates within the rule's count/until bounds, up to `upToDate` (inclusive). */
function boundedOccurrenceDates(
  rule: RecurrenceRule,
  startDate: string,
  upToDate: string,
): string[] {
  const dates: string[] = [];
  let index = 0;
  for (const date of rawOccurrenceDates(rule, startDate, upToDate)) {
    if (rule.until && date > rule.until) {
      break;
    }
    index += 1;
    if (typeof rule.count === "number" && index > rule.count) {
      break;
    }
    dates.push(date);
  }
  return dates;
}

function occurrenceFromDate(dateOnly: string, startNaive: string): string {
  const time = startNaive.slice(11) || "00:00:00";
  return `${dateOnly} ${time}`;
}

/** The first occurrence's naive start (the series anchor's own date/time). */
export function firstOccurrence(rule: RecurrenceRule, startNaive: string): string | null {
  const startDate = startNaive.slice(0, 10);
  if (!isDateOnly(startDate)) {
    return null;
  }
  const dates = boundedOccurrenceDates(rule, startDate, addDays(startDate, 366 * 5));
  return dates.length > 0 ? occurrenceFromDate(dates[0], startNaive) : null;
}

/** The last occurrence's naive start for a finite rule, null for Forever. */
export function lastOccurrence(rule: RecurrenceRule, startNaive: string): string | null {
  const startDate = startNaive.slice(0, 10);
  if (!isDateOnly(startDate)) {
    return null;
  }
  if (typeof rule.count !== "number" && !rule.until) {
    return null;
  }
  const upTo = rule.until ?? "9999-12-31";
  const dates = boundedOccurrenceDates(rule, startDate, upTo);
  return dates.length > 0 ? occurrenceFromDate(dates[dates.length - 1], startNaive) : null;
}

/**
 * Expand occurrence starts whose dates fall in `[fromNaive, toNaive]`,
 * inclusive, capped at `limit`. The first occurrence is always the series
 * start (weekly rules are normalized to include its weekday).
 */
export function expandOccurrences(
  rule: RecurrenceRule,
  startNaive: string,
  fromNaive: string,
  toNaive: string,
  limit = 500,
): string[] {
  const startDate = startNaive.slice(0, 10);
  const fromDate = fromNaive.slice(0, 10);
  const toDate = toNaive.slice(0, 10);
  if (!isDateOnly(startDate) || !isDateOnly(fromDate) || !isDateOnly(toDate) || toDate < fromDate) {
    return [];
  }
  const out: string[] = [];
  for (const date of boundedOccurrenceDates(rule, startDate, toDate)) {
    if (date < fromDate) {
      continue;
    }
    out.push(occurrenceFromDate(date, startNaive));
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

/** 1-based index of an occurrence date in the series, or null when not a slot. */
export function occurrenceIndex(
  rule: RecurrenceRule,
  startNaive: string,
  occurrenceNaive: string,
): number | null {
  const startDate = startNaive.slice(0, 10);
  const targetDate = occurrenceNaive.slice(0, 10);
  if (!isDateOnly(startDate) || !isDateOnly(targetDate) || targetDate < startDate) {
    return null;
  }
  const dates = boundedOccurrenceDates(rule, startDate, targetDate);
  const index = dates.indexOf(targetDate);
  return index >= 0 ? index + 1 : null;
}

/**
 * The rule for a "this and following" successor: a COUNT-limited series keeps
 * only the remaining occurrences; UNTIL/Forever are unchanged. Null means the
 * successor has no occurrences left.
 */
export function remainingRecurrence(
  rule: RecurrenceRule,
  startNaive: string,
  splitNaive: string,
): RecurrenceRule | null {
  if (typeof rule.count !== "number") {
    return rule;
  }
  const index = occurrenceIndex(rule, startNaive, splitNaive);
  if (index === null) {
    return rule;
  }
  const remaining = rule.count - index + 1;
  if (remaining < 1) {
    return null;
  }
  if (remaining === 1) {
    return { ...rule, count: 1 };
  }
  return { ...rule, count: Math.min(remaining, MAX_RECURRENCE_COUNT) };
}

/** Occurrence starts inside `[from, to]` instants (for the KAH look-ahead). */
export function occurrencesInRange(
  rule: RecurrenceRule,
  startNaive: string,
  from: Date,
  to: Date,
  limit = 500,
): string[] {
  return expandOccurrences(
    rule,
    startNaive,
    formatInstantToNaive(from),
    formatInstantToNaive(to),
    limit,
  );
}

/** True when `value` is a supported rule shape (used by tests/UI guards). */
export function isRecurrenceRule(value: unknown): value is RecurrenceRule {
  if (!value || typeof value !== "object") {
    return false;
  }
  const rule = value as Partial<RecurrenceRule>;
  return isFrequency(rule.freq) && typeof rule.interval === "number";
}

/** The next `limit` occurrence starts after `fromNaive` (inclusive), for previews. */
export function nextOccurrences(
  rule: RecurrenceRule,
  startNaive: string,
  fromNaive: string,
  limit = 3,
): string[] {
  const startDate = startNaive.slice(0, 10);
  if (!isDateOnly(startDate)) {
    return [];
  }
  const horizon = addDays(startDate, 366 * MAX_UNTIL_YEARS);
  return expandOccurrences(rule, startNaive, fromNaive, horizon, limit);
}
