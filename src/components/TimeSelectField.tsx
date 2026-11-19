"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Badge, Stack, Text, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronDown, IconClock } from "@tabler/icons-react";

import { MotionModal } from "@/components/MotionModal";
import {
  enabledHourOptions,
  enabledMinuteOptions,
  TIME_HOUR_OPTIONS,
  timeMinuteOptions,
  type TimeBounds,
} from "@/lib/events/timeOptions";
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
 * `minTime`/`maxTime` (same-date ranges) are **advisory**: every cell stays
 * selectable (either side may be set first), but times outside the current
 * window get a dashed amber ring and an aria-label suffix naming the other side;
 * the selected value is never marked. A dimmed caption explains the mark.
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
  /**
   * The other side's current start `HH:mm` (same-date ranges). Times before it
   * are marked out of order but remain selectable.
   */
  minTime?: string;
  /**
   * The other side's current end `HH:mm` (same-date ranges). Times after it are
   * marked out of order but remain selectable.
   */
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
 * applies every pick immediately — an hour keeps the highlighted minute, a
 * minute uses the highlighted hour — so closing the dialog by any means keeps
 * what was picked. Picking a minute while an hour is set also applies the time
 * and closes the dialog (and picking an hour after a minute on an empty field
 * does the same).
 *
 * Same-date bounds (the other side's current time) are **advisory**: every cell
 * stays selectable, because either side may be set first and the wizard flags an
 * inverted pair afterwards. Cells outside the bounds get a dashed amber ring
 * (and an aria-label suffix) unless they are the selected value; a dimmed
 * caption explains the mark. Because `MotionModal` is not `keepMounted`, this
 * component remounts on every open and its state re-seeds from `value` (the
 * `UserSelectModalBody` pattern).
 */
function TimeSelectDialogBody({
  value,
  minTime,
  maxTime,
  onApply,
  onClose,
}: {
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
  const hourRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const minutes = useMemo(() => timeMinuteOptions(value), [value]);
  const bounds: TimeBounds = useMemo(() => ({ min: minTime, max: maxTime }), [minTime, maxTime]);
  // In-order cells (advisory only — every cell stays selectable). The pure
  // helpers still compute the window; the complement is what gets the ring.
  const inOrderHours = useMemo(() => enabledHourOptions(minutes, bounds), [minutes, bounds]);
  const inOrderHourSet = useMemo(() => new Set(inOrderHours), [inOrderHours]);
  const inOrderMinuteSet = useMemo(
    () => new Set(enabledMinuteOptions(minutes, hour, bounds)),
    [minutes, hour, bounds],
  );
  // Roving tabindex: every hour is focusable now, so the tab stop follows the
  // stored hour (or the first cell) and the arrow keys never skip a cell.
  const tabbableHour = hour || TIME_HOUR_OPTIONS[0];
  // Which current value the advisory bounds came from; used for the caption and
  // each cell's accessible name.
  const otherSide = minTime && !maxTime ? "start" : maxTime && !minTime ? "end" : null;
  const outOfOrderLabel = otherSide ? `out of order with the current ${otherSide}` : undefined;
  const boundsHint =
    minTime && !maxTime
      ? "Times before the current start are marked amber — you can still pick one and adjust the start."
      : maxTime && !minTime
        ? "Times after the current end are marked amber — you can still pick one and adjust the end."
        : minTime && maxTime
          ? "Times outside the current range are marked amber — you can still pick one and adjust the other side."
          : null;

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
      {boundsHint ? (
        <Text size="xs" c="dimmed">
          {boundsHint}
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
              outOfOrder={option !== hour && !inOrderHourSet.has(option)}
              outOfOrderLabel={outOfOrderLabel}
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
              outOfOrder={option !== minute && !inOrderMinuteSet.has(option)}
              outOfOrderLabel={outOfOrderLabel}
              onSelect={() => pickMinute(option)}
            />
          ))}
        </div>
      </div>
    </Stack>
  );
}

/**
 * One hour/minute badge chip: a real 44px button, pressed-state aware. Every
 * cell is selectable — an out-of-order time (against the other side's current
 * value) keeps the normal badge and gains a dashed amber ring instead, and its
 * accessible name says which side it conflicts with, so the cue is never
 * color-only and the cell never reads as unavailable.
 */
function TimeCell({
  label,
  ariaLabel,
  selected,
  outOfOrder = false,
  outOfOrderLabel,
  tabIndex,
  autoFocus = false,
  cellRef,
  onSelect,
  onKeyDown,
}: {
  label: string;
  ariaLabel: string;
  selected: boolean;
  outOfOrder?: boolean;
  outOfOrderLabel?: string;
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
      aria-label={outOfOrder && outOfOrderLabel ? `${ariaLabel}, ${outOfOrderLabel}` : ariaLabel}
      tabIndex={tabIndex}
      data-autofocus={autoFocus ? "" : undefined}
      data-out-of-order={outOfOrder ? "" : undefined}
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
