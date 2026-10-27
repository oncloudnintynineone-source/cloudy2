/**
 * Pure helpers for the selectable sections inside a filter group (event-type
 * groups, department sections in the user picker). Kept I/O-free so the
 * all/none interaction can be unit-tested without a dialog.
 */

/** Minimal shape a section option needs for selection math. */
export interface SectionOptionValue {
  value: string;
}

export type SectionSelectionState = "all" | "none" | "some";

function optionValues(options: readonly SectionOptionValue[]): string[] {
  return options.map((option) => option.value);
}

/**
 * Whether every / none / only some of a section's options are selected.
 * Unknown ids in `selected` are ignored; an empty section counts as "all" so
 * its All button is disabled rather than silently selectable.
 */
export function sectionSelectionState(
  options: readonly SectionOptionValue[],
  selected: readonly string[],
): SectionSelectionState {
  if (options.length === 0) {
    return "all";
  }
  const chosen = new Set(selected);
  const count = options.reduce((sum, option) => sum + (chosen.has(option.value) ? 1 : 0), 0);
  if (count === 0) {
    return "none";
  }
  return count === options.length ? "all" : "some";
}

/**
 * Apply All/None to one section without disturbing selections from any other
 * section of the same group: ids outside the section are preserved, and
 * selecting a section adds its values in section order.
 */
export function applySectionSelection(
  options: readonly SectionOptionValue[],
  selected: readonly string[],
  mode: "all" | "none",
): string[] {
  const values = optionValues(options);
  const inSection = new Set(values);
  const outside = selected.filter((value) => !inSection.has(value));
  return mode === "none" ? outside : [...outside, ...values];
}
