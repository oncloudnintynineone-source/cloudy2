/**
 * Pure helpers for the per-event-type "time options" feature. An admin enables
 * one or more options on an event type, restricting how the event form may
 * express the event's datetime:
 *
 * - `range` ("Start & End") — always timed: two date pickers plus two
 *   keyboard-free 24h time pickers (tap-to-select dropdown, 15-min step).
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
export function resolveTimeOption(allowed: TimeOption[], selected: TimeOption | "" | null): TimeOption {
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

export type AmPm = "AM" | "PM" | "";

