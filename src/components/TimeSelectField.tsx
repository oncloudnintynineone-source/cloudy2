"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Badge, Stack, Text, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronDown, IconClock } from "@tabler/icons-react";

import { MotionModal } from "@/components/MotionModal";
import { isTimeWithinBounds, TIME_HOUR_OPTIONS, timeMinuteOptions } from "@/lib/events/timeOptions";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";

/**
 * The wizard's Start/End time control: a 44px "Select time" button (showing the
 * current `HH:mm`) that opens a centered picker dialog stacked above the event
 * wizard.
 *
 * The dialog shows all 24 hours at once plus the 15-minute stops, so no
 * scrolling or keyboard is involved. It opens with the stored hour and minute
 * highlighted and applies each valid pick immediately (an hour keeps the stored
 * minute, a minute uses the stored hour), so closing it any way — X, backdrop,
 * Escape, or the automatic close after a minute pick — keeps the change.
 * `minTime`/`maxTime` (same-date ranges) reject an out-of-order pick with a red
 * in-dialog alert and a ringed cell; the rejected value is never applied.
 * `onChange` therefore fires on every valid pick, exactly once per tap.
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
  /** Earliest allowed `HH:mm` (inclusive) when the range's dates are equal. */
  minTime?: string;
  /** Latest allowed `HH:mm` (inclusive) when the range's dates are equal. */
  maxTime?: string;
}

export function TimeSelectField({
  label,
  value,
  onChange,
  error,
  minTime,
  maxTime,
}: TimeSelectFieldProps) {
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
          label={label}
          value={value}
          minTime={minTime}
          maxTime={maxTime}
          onApply={onChange}
          onClose={() => setOpened(false)}
        />
      </MotionModal>
    </Stack>
  );
}

/** Hour columns per row: every row starts at 00 / 06 / 12 / 18. */
const HOUR_COLUMNS = 6;

/**
 * The picker body. It opens with the stored hour and minute highlighted and
 * applies every valid pick immediately — an hour keeps the stored minute, a
 * minute uses the stored hour — so closing the dialog by any means keeps what
 * was picked. Picking a minute while an hour is set closes the dialog (and
 * picking an hour after a minute on an empty field does the same).
 *
 * A pick that would fall outside the field's inclusive bounds (only possible
 * when the range's dates are equal) is staged so the other half can still be
 * corrected, but it is never applied: the dialog shows a red alert and rings
 * the rejected cell. Because `MotionModal` is not `keepMounted`, this component
 * remounts on every open and its state re-seeds from `value` (the
 * `UserSelectModalBody` pattern).
 */
function TimeSelectDialogBody({
  label,
  value,
  minTime,
  maxTime,
  onApply,
  onClose,
}: {
  label: string;
  value: string;
  minTime?: string;
  maxTime?: string;
  onApply: (time: string) => void;
  onClose: () => void;
}) {
  const [hour, setHour] = useState(() => value.slice(0, 2));
  const [minute, setMinute] = useState(() => value.slice(3, 5));
  // A minute picked before any hour (an empty-time field) waits for the hour
  // pick, which then completes the pair and closes the dialog.
  const [minutePicked, setMinutePicked] = useState(false);
  // An out-of-bounds pick stays staged (so the other half remains adjustable)
  // but is never applied; these drive the alert and the red cell ring.
  const [boundsError, setBoundsError] = useState<string | null>(null);
  const [invalidPick, setInvalidPick] = useState<{
    part: "hour" | "minute";
    value: string;
  } | null>(null);
  const hourRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const minutes = useMemo(() => timeMinuteOptions(value), [value]);
  // Roving tabindex: the highlighted (or first) hour is the grid's only tab stop.
  const tabbableHour = hour || TIME_HOUR_OPTIONS[0];
  const boundsMessage =
    minTime && maxTime
      ? `${label} must be between ${minTime} and ${maxTime}.`
      : minTime
        ? `${label} must be on or after ${minTime}.`
        : maxTime
          ? `${label} must be on or before ${maxTime}.`
          : null;

  /** Apply `candidate` when it is within bounds; otherwise flag it and refuse. */
  function accept(candidate: string): boolean {
    if (!isTimeWithinBounds(candidate, { min: minTime, max: maxTime })) {
      setBoundsError(boundsMessage);
      return false;
    }
    setBoundsError(null);
    setInvalidPick(null);
    onApply(candidate);
    return true;
  }

  function pickHour(next: string) {
    setHour(next);
    const candidate = `${next}:${minute || "00"}`;
    if (!accept(candidate)) {
      setInvalidPick({ part: "hour", value: next });
      return;
    }
    setMinute(candidate.slice(3, 5));
    // Apply at once: closing after an hour-only change keeps it.
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
    if (!accept(`${hour}:${next}`)) {
      setInvalidPick({ part: "minute", value: next });
      return;
    }
    onClose();
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
      {boundsError ? (
        <Text size="sm" c="red" role="alert">
          {boundsError}
        </Text>
      ) : null}
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
              invalid={invalidPick?.part === "hour" && invalidPick.value === option}
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
              invalid={invalidPick?.part === "minute" && invalidPick.value === option}
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
  invalid = false,
  tabIndex,
  autoFocus = false,
  cellRef,
  onSelect,
  onKeyDown,
}: {
  label: string;
  ariaLabel: string;
  selected: boolean;
  invalid?: boolean;
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
      aria-invalid={invalid || undefined}
      tabIndex={tabIndex}
      data-autofocus={autoFocus ? "" : undefined}
      data-invalid={invalid || undefined}
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
