"use client";

import { NoKeyboardSelect } from "./NoKeyboardSelect";

interface TimeRangeSelectProps<T extends number> {
  /** Field label ("Range", "Look ahead"). */
  label: string;
  /** Selectable windows in months, display order (the default first). */
  values: readonly T[];
  /** Option label for a window ("±3 months", "1 year"). */
  labelFor: (months: T) => string;
  /** The window currently in effect. */
  months: T;
  /** Fires only with one of `values` — never with a cleared selection. */
  onSelect: (months: T) => void;
  disabled?: boolean;
}

/**
 * The month-window dropdown shared by My Events ("Range") and KAH Status
 * ("Look ahead") — the two pages used to hand-roll the same control, which let
 * one of them drift to an underscaled `size="xs"`.
 *
 * Deliberately rendered at the app's default combobox size (no `size` prop);
 * `w={150}` matches the audit log's date-range pickers, the other sticky-chrome
 * date controls. The list text is guaranteed to match the field's 16px by the
 * `comboboxOptionFloor` in `src/lib/theme.ts` — an `xs` select used to open a
 * list *smaller* than its own field (12px options in ~27px rows).
 */
export function TimeRangeSelect<T extends number>({
  label,
  values,
  labelFor,
  months,
  onSelect,
  disabled,
}: TimeRangeSelectProps<T>) {
  return (
    <NoKeyboardSelect
      label={label}
      w={150}
      allowDeselect={false}
      disabled={disabled}
      value={String(months)}
      onChange={(value) => {
        const next = values.find((candidate) => String(candidate) === value);
        if (next !== undefined) {
          onSelect(next);
        }
      }}
      data={values.map((value) => ({ value: String(value), label: labelFor(value) }))}
    />
  );
}
