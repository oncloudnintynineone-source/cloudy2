/**
 * Pure copy/state helpers shared by every badge picker (`PickerField`,
 * `PickerTrigger`, `UserSelectModal`). Kept I/O-free so the wording rules can be
 * unit-tested without a component — the whole point is that no consumer invents
 * its own "Select"/"Add" label (docs/user-picker.md §1.7).
 */

export interface PickerTriggerLabels {
  /** Label while nothing is picked; default "Add". */
  addLabel?: string;
  /** Label once something is picked; default "Edit". */
  editLabel?: string;
}

/**
 * The picker trigger's label: a trigger must never read as add-only when items
 * are already picked — that is exactly how users end up hunting for a way to
 * remove someone. `count === 0` invites adding, anything else says the dialog
 * edits the existing set (add _and_ remove).
 */
export function pickerTriggerLabel(count: number, labels: PickerTriggerLabels = {}): string {
  const { addLabel = "Add", editLabel = "Edit" } = labels;
  return count > 0 ? editLabel : addLabel;
}

/**
 * Whether a summary chip should offer a remove affordance: never on the `+N`
 * overflow badge, and never when the caller has no removal path.
 */
export function pickerChipRemovable(count: number): boolean {
  return count > 0;
}
