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
 * highlighted; the user then picks an hour and a minute, and the second pick
 * applies the time and closes the dialog (dismissing with the X, backdrop or
 * Escape discards the picks). `onChange` therefore runs once, on the second
 * pick, so the wizard's end-clamping runs once too.
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
        <TimeSelectDialogBody
          value={value}
          onCommit={(time) => {
            onChange(time);
            setOpened(false);
          }}
        />
      </MotionModal>
    </Stack>
  );
}

/** Hour columns per row: every row starts at 00 / 06 / 12 / 18. */
const HOUR_COLUMNS = 6;

/**
 * The picker body. It opens with the stored hour and minute highlighted (so the
 * current time is visible as context), then waits for the user to pick **both**
 * halves: the second pick applies the time and closes the dialog. Dismissing
 * with the X, backdrop or Escape discards the picks. Because `MotionModal` is
 * not `keepMounted`, this component remounts on every open and its state
 * re-seeds from `value` (the `UserSelectModalBody` pattern).
 */
function TimeSelectDialogBody({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (time: string) => void;
}) {
  const [hour, setHour] = useState(() => value.slice(0, 2));
  const [minute, setMinute] = useState(() => value.slice(3, 5));
  // The highlighted stored value is context only: the dialog commits once the
  // user has explicitly picked an hour and a minute in this session.
  const [hourPicked, setHourPicked] = useState(false);
  const [minutePicked, setMinutePicked] = useState(false);
  const hourRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const minutes = useMemo(() => timeMinuteOptions(value), [value]);
  // Roving tabindex: the highlighted (or first) hour is the grid's only tab stop.
  const tabbableHour = hour || TIME_HOUR_OPTIONS[0];

  function pickHour(next: string) {
    setHour(next);
    setHourPicked(true);
    if (minutePicked) {
      onCommit(`${next}:${minute}`);
    }
  }

  function pickMinute(next: string) {
    setMinute(next);
    setMinutePicked(true);
    if (hourPicked) {
      onCommit(`${hour}:${next}`);
    }
  }

  function handleHourKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: string) {
    const index = TIME_HOUR_OPTIONS.indexOf(current);
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = index + 1;
        break;
      case "ArrowLeft":
        next = index - 1;
        break;
      case "ArrowDown":
        next = index + HOUR_COLUMNS;
        break;
      case "ArrowUp":
        next = index - HOUR_COLUMNS;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = TIME_HOUR_OPTIONS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const count = TIME_HOUR_OPTIONS.length;
    const wrapped = ((next % count) + count) % count;
    hourRefs.current[TIME_HOUR_OPTIONS[wrapped]]?.focus();
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
