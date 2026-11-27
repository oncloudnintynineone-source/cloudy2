export interface FilterApplyGroup {
  label: string;
  /** Number of selectable options; "all selected" = optionCount. */
  optionCount: number;
  /** "grid" (default) checkbox cards vs "search" dropdown (empty = no filter). */
  variant?: "grid" | "search";
  /**
   * The selectable option ids, when the caller has them. Makes the
   * "everything selected = no filter" test a **set** comparison, so a stored id
   * that is no longer an option (the option list shrank under an applied
   * selection) can never be mistaken for "all selected" and silently dropped.
   */
  optionValues?: readonly string[];
}

function matchesOptionSet(
  selected: readonly string[],
  optionValues: readonly string[],
): boolean {
  if (selected.length !== optionValues.length) {
    return false;
  }
  const options = new Set(optionValues);
  return selected.every((value) => options.has(value));
}

/** True when a group's selection means "no filter" (variant-dependent). */
export function isGroupUnfiltered(
  group: Pick<FilterApplyGroup, "variant" | "optionCount" | "optionValues">,
  selected: readonly string[],
): boolean {
  if (group.variant === "search") {
    if (selected.length === 0) {
      return true;
    }
  } else if (selected.length === 0 && group.optionCount > 0) {
    // A grid with nothing ticked is a genuine "None", not "no filter".
    return false;
  }
  if (group.optionValues) {
    return matchesOptionSet(selected, group.optionValues);
  }
  return selected.length === group.optionCount;
}

export type GroupFilterStateKind = "all" | "none" | "some";

export interface GroupFilterState {
  kind: GroupFilterStateKind;
  /** Compact chip label: `"All"` / `"None"` / `"3 of 12"`. */
  label: string;
  /** True when the selection actually filters (`kind !== "all"`). */
  active: boolean;
  /** Selected option count, clamped to the group's option count. */
  count: number;
}

/**
 * The one "what is selected here?" answer every filter group header shows, so a
 * grid group, a sectioned group and a search group describe their state in the
 * same words. Built on {@link isGroupUnfiltered}, so the variant-dependent
 * meaning of "no filter" (grid: everything ticked; search: nothing ticked) can
 * never drift from what Apply actually stores.
 *
 * With `optionValues` present the count only includes ids the dialog can
 * actually show, and a selection naming something outside the option list is
 * never reported as "All" — it reads as a real filter (or "None" when nothing
 * visible is left) so the header/chips can't promise something Apply won't do.
 */
export function groupFilterState(
  group: Pick<FilterApplyGroup, "variant" | "optionCount" | "optionValues">,
  selected: readonly string[],
): GroupFilterState {
  const visible = group.optionValues
    ? selected.filter((value) => group.optionValues?.includes(value))
    : selected;
  const count = Math.min(visible.length, group.optionCount);
  if (isGroupUnfiltered(group, selected)) {
    return { kind: "all", label: "All", active: false, count };
  }
  if (count === 0) {
    return { kind: "none", label: "None", active: true, count };
  }
  return { kind: "some", label: `${count} of ${group.optionCount}`, active: true, count };
}

/**
 * Group labels are the UI's plural nouns ("Event Types"), so a single pick reads
 * better singular ("1 event type"). Only regular English plurals reduce — words
 * that merely end in `s` ("Status", "Access") stay untouched.
 */
const ALREADY_SINGULAR = /(ss|us|is|xs)$/i;

function singularizeLabel(label: string): string {
  return label.length > 1 && !ALREADY_SINGULAR.test(label) && label.endsWith("s")
    ? label.slice(0, -1)
    : label;
}

/**
 * One plain-language entry per group for the dialog's "Showing: …" line, e.g.
 * `["All calendars", "3 users", 'Event name "parade"']`. It reads the same
 * variant semantics as Apply, so the line can never promise something the write
 * would not do.
 */
export function describeFilterGroups(
  groups: readonly FilterApplyGroup[],
  draft: Record<string, readonly string[]>,
  text?: { label: string; value: string },
): string[] {
  const entries = groups.map((group) => {
    const state = groupFilterState(group, draft[group.label] ?? []);
    const label = group.label.toLocaleLowerCase();
    if (state.kind === "all") {
      return `All ${label}`;
    }
    if (state.kind === "none") {
      return `No ${label}`;
    }
    return `${state.count} ${state.count === 1 ? singularizeLabel(label) : label}`;
  });
  const trimmed = text?.value.trim() ?? "";
  if (trimmed !== "" && text) {
    entries.push(`${text.label} "${trimmed}"`);
  }
  return entries;
}

/**
 * Resolve what each group applies when the filter dialog's "Apply" is pressed.
 *
 * Search groups keep "empty (or all) = no filter". Grid groups follow the
 * dialog's interaction state:
 * - after "Clear" they apply nothing (`[]`), restoring the consumer's default
 *   (e.g. a non-admin's own department);
 * - groups the user actually edited apply the explicit draft — including a
 *   full selection, so a user whose default isn't "all" (a non-admin) can
 *   really reach every option instead of the draft being collapsed to `[]` and
 *   falling back to the default;
 * - untouched groups re-apply the current applied values, so re-opening the
 *   dialog and pressing Apply keeps an existing filter.
 */
export function resolveFilterApply(
  groups: FilterApplyGroup[],
  draft: Record<string, string[]>,
  values: Record<string, string[]>,
  changed: ReadonlySet<string>,
  cleared: boolean,
): Record<string, string[]> {
  return Object.fromEntries(
    groups.map((group) => {
      const selected = draft[group.label] ?? [];
      if (group.variant === "search") {
        return [group.label, isGroupUnfiltered(group, selected) ? [] : selected];
      }
      if (cleared) {
        return [group.label, []];
      }
      if (changed.has(group.label)) {
        return [group.label, selected];
      }
      return [group.label, values[group.label] ?? []];
    }),
  );
}
