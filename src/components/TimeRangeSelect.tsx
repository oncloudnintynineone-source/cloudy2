"use client";

import { Menu } from "@mantine/core";
import { IconCalendarTime, IconCheck, IconChevronDown } from "@tabler/icons-react";

import { useMotion } from "@/components/MotionProvider";
import { popoverTransitionProps } from "@/lib/motion/transitions";

interface TimeRangeSelectProps<T extends number> {
  /** Field label ("Range", "Look ahead"). */
  label: string;
  /** Selectable windows in months, display order (the default first). */
  values: readonly T[];
  /** Option label for a window ("±1 month", "1 year"). */
  labelFor: (months: T) => string;
  /** The window currently in effect. */
  months: T;
  /** Fires only with one of `values` — never with a cleared selection. */
  onSelect: (months: T) => void;
  disabled?: boolean;
}

/** 44px rows (the app's thumb-scale tap target) with page-scale text, so the
 *  list never reads smaller than the field that opened it. */
const MENU_STYLES = {
  item: {
    minHeight: "calc(2.75rem * var(--mantine-scale))",
    paddingInline: "calc(0.75rem * var(--mantine-scale))",
    fontSize: "var(--mantine-font-size-md)",
  },
} as const;

/**
 * The month-window dropdown shared by My Events ("Range"), KAH Status and
 * Double Booking ("Look ahead").
 *
 * A `Menu` rather than a `Select`: the control has nothing to type, and a menu
 * trigger is a plain button, so a tap can never raise the virtual keyboard
 * (the rule `NoKeyboardSelect` exists to work around). The trigger is an
 * input-look pill (`.c2-range-trigger`, `globals.css`) that fills its column on
 * phones and hugs its content from the 40em desktop band on, so the same
 * control fits a stacked mobile header and a sticky desktop chrome row without
 * a per-page width override. The label rides inside the pill at 40em+ and moves
 * into the dropdown header below it, where the pill stays short enough to scan.
 */
export function TimeRangeSelect<T extends number>({
  label,
  values,
  labelFor,
  months,
  onSelect,
  disabled,
}: TimeRangeSelectProps<T>) {
  const motion = useMotion();
  const current = labelFor(months);

  return (
    <Menu
      shadow="md"
      width="target"
      position="bottom-start"
      disabled={disabled}
      transitionProps={popoverTransitionProps(motion)}
      styles={MENU_STYLES}
    >
      <Menu.Target>
        <button
          type="button"
          className="c2-range-trigger"
          disabled={disabled}
          aria-label={`${label}: ${current}`}
        >
          <IconCalendarTime className="c2-range-trigger-icon" size={18} aria-hidden />
          <span className="c2-range-trigger-value">
            <span className="c2-range-trigger-label">{label}</span>
            {current}
          </span>
          <IconChevronDown className="c2-range-trigger-chevron" size={18} aria-hidden />
        </button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{label}</Menu.Label>
        {values.map((value) => {
          const active = value === months;
          return (
            <Menu.Item
              key={value}
              aria-current={active ? "true" : undefined}
              fw={active ? 600 : undefined}
              rightSection={
                active ? <IconCheck size={18} color="var(--mantine-color-brand-filled)" /> : null
              }
              onClick={() => {
                if (!active) {
                  onSelect(value);
                }
              }}
            >
              {labelFor(value)}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
