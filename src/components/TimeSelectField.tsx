"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Badge, Stack, Text, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronDown, IconClock } from "@tabler/icons-react";

import { MotionModal } from "@/components/MotionModal";
import { TIME_HOUR_OPTIONS, timeMinuteOptions } from "@/lib/events/timeOptions";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";

/**
 * The wizard's Start/End time control: a 44px "Select time" button (showing the
 * current `HH:mm`) that opens a centered picker dialog stacked above the event
 * wizard.
 *
 * The dialog shows all 24 hours at once plus the 15-minute stops, so no
 * scrolling or keyboard is involved. It opens with the stored hour and minute
 * highlighted and applies every pick immediately (an hour keeps the stored
 * minute, a minute uses the stored hour), so closing it any way — X, backdrop,
 * Escape, or the automatic close after a minute pick — keeps the change. No
 * time is restricted: either side of a range may be moved past the other, and
 * the wizard's ordering validation flags an inverted pair after the pick.
 * `onChange` therefore fires on every applied pick, exactly once per tap.
 */

/** Escape inside the dialog must close the dialog, not minimize the wizard. */
const STOP_ESCAPE = {
  "aria-label": "Close time picker",
  "data-mantine-stop-propagation": "true",
} as const;

export interface TimeSelectFieldProps {
  /** Visible caption, e.g. "Start time"; also the dialog title. */
  label: string;
  /** Current `HH:mm` value, or "" when no time is set. */
  value: string;
  /** Called with the picked `HH:mm` when both halves have been chosen. */
  onChange: (time: string) => void;
  /** Validation message rendered under the button. */
  error?: ReactNode;
}

export function TimeSelectField({ label, value, onChange, error }: TimeSelectFieldProps) {
  const [opened, setOpened] = useState(false);
  const errorId = useId();
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  const hasValue = value !== "";

  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        {label}
      </Text>
      <UnstyledButton
        type="button"
        className="c2-time-trigger"
        data-empty={hasValue ? undefined : true}
        data-invalid={error ? true : undefined}
        aria-haspopup="dialog"
        aria-expanded={opened}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        aria-label={`${label}, ${hasValue ? value : "no time selected"}, opens time picker`}
        onClick={() => setOpened(true)}
      >
        <IconClock size={16} className="c2-time-trigger-icon" aria-hidden />
        <span className="c2-time-trigger-value">{hasValue ? value : "Select time"}</span>
        <IconChevronDown size={16} className="c2-time-trigger-icon" aria-hidden />
      </UnstyledButton>
      {error ? (
        <Text id={errorId} size="xs" c="red">
          {error}
        </Text>
      ) : null}
      <MotionModal
        opened={opened}
        onClose={() => setOpened(false)}
        title={label}
        centered
        size={isNarrow ? "xs" : "sm"}
        zIndex={300}
        closeButtonProps={STOP_ESCAPE}
      >
        <TimeSelectDialogBody value={value} onApply={onChange} onClose={() => setOpened(false)} />
      </MotionModal>
    </Stack>
  );
}

/** Hour columns per row: every row starts at 00 / 06 / 12 / 18. */
const HOUR_COLUMNS = 6;

/**
 * The picker body. It opens with the stored hour and minute highlighted and
 * applies every pick immediately — an hour keeps the highlighted minute, a
 * minute uses the highlighted hour — so closing the dialog by any means keeps
 * what was picked. Picking a minute while an hour is set also applies the time
 * and closes the dialog (and picking an hour after a minute on an empty field
 * does the same). Because `MotionModal` is not `keepMounted`, this component
 * remounts on every open and its state re-seeds from `value` (the
 * `UserSelectModalBody` pattern).
 */
function TimeSelectDialogBody({
  value,
  onApply,
  onClose,
}: {
  value: string;
  onApply: (time: string) => void;
  onClose: () => void;
}) {
  const [hour, setHour] = useState(() => value.slice(0, 2));
  const [minute, setMinute] = useState(() => value.slice(3, 5));
  // A minute picked before any hour (an empty-time field) waits for the hour
  // pick, which then completes the pair and closes the dialog.
  const [minutePicked, setMinutePicked] = useState(false);
  const hourRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const minutes = useMemo(() => timeMinuteOptions(value), [value]);
  // Roving tabindex: the tab stop follows the stored hour (or the first cell)
  // and the arrow keys never skip a cell.
  const tabbableHour = hour || TIME_HOUR_OPTIONS[0];

  function pickHour(next: string) {
    setHour(next);
    const candidate = `${next}:${minute || "00"}`;
    setMinute(candidate.slice(3, 5));
    // Apply at once: closing after an hour-only change keeps it.
    onApply(candidate);
    if (minutePicked) {
      onClose();
    }
  }

  function pickMinute(next: string) {
    setMinute(next);
    setMinutePicked(true);
    if (!hour) {
      // The minute waits for an hour pick (an empty-time field).
      return;
    }
    onApply(`${hour}:${next}`);
    onClose();
  }

  /** Focus the hour `delta` cells away (wrap around the 24-cell grid). */
  function focusRelativeHour(index: number, delta: number) {
    const count = TIME_HOUR_OPTIONS.length;
    const target = (((index + delta) % count) + count) % count;
    hourRefs.current[TIME_HOUR_OPTIONS[target]]?.focus();
  }

  function focusEdgeHour(last: boolean) {
    const option = last ? TIME_HOUR_OPTIONS[TIME_HOUR_OPTIONS.length - 1] : TIME_HOUR_OPTIONS[0];
    hourRefs.current[option]?.focus();
  }

  function handleHourKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: string) {
    const index = TIME_HOUR_OPTIONS.indexOf(current);
    let delta: number;
    switch (event.key) {
      case "ArrowRight":
        delta = 1;
        break;
      case "ArrowLeft":
        delta = -1;
        break;
      case "ArrowDown":
        delta = HOUR_COLUMNS;
        break;
      case "ArrowUp":
        delta = -HOUR_COLUMNS;
        break;
      case "Home":
        event.preventDefault();
        focusEdgeHour(false);
        return;
      case "End":
        event.preventDefault();
        focusEdgeHour(true);
        return;
      default:
        return;
    }
    event.preventDefault();
    focusRelativeHour(index, delta);
  }

  return (
    <Stack gap="sm">
      <div>
        <Text size="xs" c="dimmed" fw={600} mb={4}>
          Hour
        </Text>
        <div className="c2-time-grid" role="group" aria-label="Hour">
          {TIME_HOUR_OPTIONS.map((option) => (
            <TimeCell
              key={option}
              label={option}
              ariaLabel={`${Number(option)} o'clock`}
              selected={option === hour}
              tabIndex={option === tabbableHour ? 0 : -1}
              autoFocus={option === tabbableHour}
              cellRef={(node) => {
                hourRefs.current[option] = node;
              }}
              onSelect={() => pickHour(option)}
              onKeyDown={(event) => handleHourKeyDown(event, option)}
            />
          ))}
        </div>
      </div>
      <div>
        <Text size="xs" c="dimmed" fw={600} mb={4}>
          Minutes
        </Text>
        <div className="c2-time-minutes" role="group" aria-label="Minutes">
          {minutes.map((option) => (
            <TimeCell
              key={option}
              label={option}
              ariaLabel={`${option} minutes past the hour`}
              selected={option === minute}
              onSelect={() => pickMinute(option)}
            />
          ))}
        </div>
      </div>
    </Stack>
  );
}

/** One hour/minute badge chip: a real 44px button, pressed-state aware. */
function TimeCell({
  label,
  ariaLabel,
  selected,
  tabIndex,
  autoFocus = false,
  cellRef,
  onSelect,
  onKeyDown,
}: {
  label: string;
  ariaLabel: string;
  selected: boolean;
  tabIndex?: number;
  autoFocus?: boolean;
  cellRef?: (node: HTMLButtonElement | null) => void;
  onSelect: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <UnstyledButton
      ref={cellRef}
      type="button"
      className="c2-time-cell"
      aria-pressed={selected}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      data-autofocus={autoFocus ? "" : undefined}
      data-mantine-stop-propagation="true"
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <Badge variant={selected ? "filled" : "light"} color="brand" className="c2-time-cell-badge">
        {label}
      </Badge>
    </UnstyledButton>
  );
}
