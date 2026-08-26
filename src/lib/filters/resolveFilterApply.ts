export interface FilterApplyGroup {
  label: string;
  /** Number of selectable options; "all selected" = optionCount. */
  optionCount: number;
  /** "grid" (default) checkbox cards vs "search" dropdown (empty = no filter). */
  variant?: "grid" | "search";
}

/** True when a group's selection means "no filter" (variant-dependent). */
export function isGroupUnfiltered(
  group: Pick<FilterApplyGroup, "variant" | "optionCount">,
  selected: string[],
): boolean {
  if (group.variant === "search") {
    return selected.length === 0 || selected.length === group.optionCount;
  }
  return selected.length === group.optionCount;
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
