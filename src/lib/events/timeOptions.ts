/**
 * Pure helpers for the per-event-type "time options" feature. An admin enables
 * one or more options on an event type, restricting how the event form may
 * express the event's datetime:
 *
 * - `range` ("Start & End") — always timed: two datetime pickers.
 * - `ampm` ("AM/PM") — full-day with an AM/PM indicator appended to the title.
 * - `full` ("Full Day") — full-day with no indicator.
 *
 * Kept free of I/O so the helpers are unit-testable without a database.
 */

export const TIME_OPTIONS = ["range", "ampm", "full"] as const;

export type TimeOption = (typeof TIME_OPTIONS)[number];

export const TIME_OPTION_LABELS: Record<TimeOption, string> = {
  range: "Start & End",
  ampm: "AM/PM",
  full: "Full Day",
};

export const TIME_OPTION_DESCRIPTIONS: Record<TimeOption, string> = {
  range: "Pick an exact start and end time for the event.",
  ampm: "Create the event as a full day and tag the title (AM) or (PM).",
  full: "Create the event as a full day.",
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
