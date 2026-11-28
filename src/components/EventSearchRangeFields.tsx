"use client";

import "@mantine/dates/styles.css";
import { Button, Group, Stack } from "@mantine/core";
import { MonthPickerInput } from "@mantine/dates";

import { shiftMonth } from "@/lib/events/datetime";
import {
  monthLabel,
  monthStart,
  SEARCH_MAX_RANGE_MONTHS,
} from "@/lib/events/searchRange";

interface EventSearchRangeFieldsProps {
  /** `YYYY-MM` keys — the search window is month-granular. */
  fromMonth: string;
  toMonth: string;
  /** Fires with a complete window; the pickers are never clearable. */
  onChange: (range: { fromMonth: string; toMonth: string }) => void;
  onReset: () => void;
  /** True while the window still equals the default — disables Reset. */
  isDefault: boolean;
}

/**
 * The search modal's date-range fields, inside the calendar trigger's dropdown.
 *
 * **Whole months**, not days: the search reads the month cache, so a month
 * window maps 1:1 onto what is actually fetched, and "Nov 2026 – Feb 2027" is
 * the same vocabulary the app's other range controls use (`monthRange.ts`).
 *
 * Each picker is bounded by the other plus `SEARCH_MAX_RANGE_MONTHS`, so an
 * impossible window cannot be picked — the server re-checks it anyway
 * (`coerceSearchMonths`).
 *
 * Side by side, and not clearable: a month value is eight characters and the
 * window always has exactly two ends, so there is no empty state to return to.
 * (The day pickers this replaced needed the full width for `2026-11-21` plus the
 * clear ✕'s reserved 50px.)
 */
export function EventSearchRangeFields({
  fromMonth,
  toMonth,
  onChange,
  onReset,
  isDefault,
}: EventSearchRangeFieldsProps) {
  // Inclusive month span: `from` counts as month 1, so the far end sits
  // `SEARCH_MAX_RANGE_MONTHS - 1` months from the near end.
  const span = SEARCH_MAX_RANGE_MONTHS - 1;

  return (
    <Stack gap="xs">
      <Group gap="xs" align="flex-start" wrap="nowrap">
        {/* Mantine v9 speaks `YYYY-MM-DD` strings: `value` is the first of the
            month and `onChange` hands back the picked month the same way, so the
            `YYYY-MM` key is simply its first 7 characters. `valueFormat` only
            changes the text the button shows. */}
        <MonthPickerInput
          label="From"
          // The wrapper's `<label for>` is not a reliable name source for the
          // `component="button"` input, so the field names itself and carries
          // its own value (WCAG 2.5.3 Label in Name).
          aria-label={`From month: ${monthLabel(fromMonth)}`}
          value={monthStart(fromMonth)}
          valueFormat="MMM YYYY"
          clearable={false}
          minDate={monthStart(shiftMonth(toMonth, -span))}
          maxDate={monthStart(toMonth)}
          // The dropdown's own Popover defaults to `returnFocus: false`, which
          // drops the caret on <body> after a pick; back to the field instead.
          popoverProps={{ returnFocus: true }}
          style={{ flex: 1, minWidth: 0 }}
          onChange={(value) => {
            if (value) {
              onChange({ fromMonth: value.slice(0, 7), toMonth });
            }
          }}
        />
        <MonthPickerInput
          label="To"
          aria-label={`To month: ${monthLabel(toMonth)}`}
          value={monthStart(toMonth)}
          valueFormat="MMM YYYY"
          clearable={false}
          minDate={monthStart(fromMonth)}
          maxDate={monthStart(shiftMonth(fromMonth, span))}
          popoverProps={{ returnFocus: true }}
          style={{ flex: 1, minWidth: 0 }}
          onChange={(value) => {
            if (value) {
              onChange({ fromMonth, toMonth: value.slice(0, 7) });
            }
          }}
        />
      </Group>
      <Button variant="subtle" size="xs" disabled={isDefault} onClick={onReset}>
        Reset to default range
      </Button>
    </Stack>
  );
}
