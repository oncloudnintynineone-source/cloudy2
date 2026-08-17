/**
 * Pure helpers for the per-event-type "time options" feature. An admin enables
 * one or more options on an event type, restricting how the event form may
 * express the event's datetime:
 *
 * - `range` ("Start & End") — always timed: two datetime pickers.
 * - `full` ("Full Day") — full-day with an optional (AM)/(PM) start/end
 *   marker: two date pickers plus an AM/PM selector each. The title gets the
 *   marker appended only when both start and end share it.
 *
 * Kept free of I/O so the helpers are unit-testable without a database.
 */

export const TIME_OPTIONS = ["range", "full"] as const;

export type TimeOption = (typeof TIME_OPTIONS)[number];

export const TIME_OPTION_LABELS: Record<TimeOption, string> = {
  range: "Start & End",
  full: "Full Day",
};

export const TIME_OPTION_DESCRIPTIONS: Record<TimeOption, string> = {
  range: "Pick an exact start and end time for the event.",
  full: "Create the event as a full day, optionally tagging the start/end with (AM) or (PM).",
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

export type AmPm = "AM" | "PM" | "";

/**
 * The (AM)/(PM) marker to append to a full-day event title: present only when
 * the start and end share the same indicator, so AM→PM and PM→AM spans render
 * without a suffix. Returns "" for missing or mixed indicators.
 */
export function amPmSuffix(startAmPm: AmPm, endAmPm: AmPm): "AM" | "PM" | "" {
  return startAmPm !== "" && startAmPm === endAmPm ? startAmPm : "";
}
