/**
 * Pure helpers for the per-event-type "time options" feature. An admin enables
 * one or more options on an event type, restricting how the event form may
 * express the event's datetime:
 *
 * - `range` ("Start & End") — always timed: two date pickers plus two
 *   keyboard-free 24h time pickers (a "Select time" button opening a
 *   hour/minute grid dialog, 15-min step).
 * - `full` ("Full Day") — plain all-day: two date pickers, no half-day
 *   markers.
 * - `half` ("Half Day") — date pickers plus an AM/PM selector each side; the
 *   title gets the marker appended only when both start and end share it.
 *   (This used to live under `full`, which is why legacy events may still
 *   carry `full` + markers in their notes.)
 *
 * Kept free of I/O so the helpers are unit-testable without a database.
 */

export const TIME_OPTIONS = ["range", "full", "half"] as const;

export type TimeOption = (typeof TIME_OPTIONS)[number];

export const TIME_OPTION_LABELS: Record<TimeOption, string> = {
  range: "Start & End",
  full: "Full Day",
  half: "Half Day",
};

export const TIME_OPTION_DESCRIPTIONS: Record<TimeOption, string> = {
  range: "Pick an exact start and end time for the event.",
  full: "Create the event as a full day (date range only).",
  half: "Pick a date range and tag the start/end with (AM) or (PM) for half days.",
};

/** Whether a value is one of the canonical time option ids. */
export function isTimeOption(value: unknown): value is TimeOption {
  return typeof value === "string" && (TIME_OPTIONS as readonly string[]).includes(value);
}

/** Normalize an untrusted list to a deduped list of valid time options. */
export function normalizeTimeOptions(values: unknown): TimeOption[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const out: TimeOption[] = [];
  const seen = new Set<TimeOption>();
  for (const value of values) {
    if (isTimeOption(value) && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

/**
 * The options an event type actually allows: empty/unrecorded types fall back
 * to the default "range" behaviour.
 */
export function resolveTimeOptions(raw: TimeOption[]): TimeOption[] {
  return raw.length > 0 ? raw : ["range"];
}

/**
 * Resolve the selected option against the type's allowed set. Unknown/empty
 * selections fall back to "range" (the default); a selection the type no longer
 * allows falls back to the first allowed option.
 */
export function resolveTimeOption(
  allowed: TimeOption[],
  selected: TimeOption | "" | null,
): TimeOption {
  const options = resolveTimeOptions(allowed);
  return selected && options.includes(selected) ? selected : options[0];
}

/**
 * The date part (`YYYY-MM-DD`) of a naive `YYYY-MM-DD HH:mm:ss` string.
 * Empty/blank input yields "".
 */
export function naiveDatePart(naive: string): string {
  return naive ? naive.slice(0, 10) : "";
}

/**
 * The time part (`HH:mm`) of a naive `YYYY-MM-DD HH:mm:ss` string, or "" when
 * no time is recorded (day-based values carry `00:00:00` — callers that need
 * to treat midnight as "no time" must check the time option, not this part).
 */
export function naiveTimePart(naive: string): string {
  const timePart = naive.split(" ")[1];
  if (!timePart) {
    return "";
  }
  const [hours, minutes] = timePart.split(":");
  return hours !== undefined && minutes !== undefined ? `${hours}:${minutes}` : "";
}

/**
 * Join a `YYYY-MM-DD` date and an `HH:mm` time into the naive
 * `YYYY-MM-DD HH:mm:ss` form. A blank time yields a bare date string (the
 * "time not yet chosen" state of a Start & End event); a blank date yields
 * "" (a time without a date is dropped rather than corrupting the value).
 */
export function joinDateTimeParts(date: string, time: string): string {
  return date && time ? `${date} ${time}:00` : date;
}

/** Every hour the wizard's 24-hour time picker offers, as `HH` strings. */
export const TIME_HOUR_OPTIONS: readonly string[] = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0"),
);

/** The fixed minute stops of the wizard's 15-minute time picker. */
export const TIME_MINUTE_OPTIONS: readonly string[] = ["00", "15", "30", "45"];

/**
 * The minute cells for a picker seeded from `value` (`HH:mm`, or "" when no
 * time is set): the fixed 15-minute stops plus the current minute when it sits
 * off-grid (e.g. an event edited in Google to 08:37) so an existing value is
 * always visible and re-selectable.
 */
export function timeMinuteOptions(value: string): string[] {
  const minute = value.slice(3, 5);
  const options: string[] = [...TIME_MINUTE_OPTIONS];
  if (minute && !options.includes(minute)) {
    options.push(minute);
  }
  return options.sort((a, b) => Number(a) - Number(b));
}

/** Inclusive `HH:mm` bounds for a time picker (either side may be absent). */
export interface TimeBounds {
  /** Earliest allowed time, inclusive. */
  min?: string;
  /** Latest allowed time, inclusive. */
  max?: string;
}

/**
 * Whether an `HH:mm` value sits inside the bounds (both inclusive). A blank
 * value is never "within" — it means no time has been chosen. Zero-padded
 * `HH:mm` strings compare chronologically as plain strings.
 */
export function isTimeWithinBounds(time: string, bounds: TimeBounds): boolean {
  if (!time) {
    return false;
  }
  if (bounds.min && time < bounds.min) {
    return false;
  }
  if (bounds.max && time > bounds.max) {
    return false;
  }
  return true;
}

export type AmPm = "AM" | "PM" | "";
