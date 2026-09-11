"use client";

import { Badge, Group, Text, UnstyledButton } from "@mantine/core";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

/**
 * Tap-to-set `HH:mm` clock: a horizontally scrollable hour row (00–23) plus a
 * fixed minute row (00/15/30/45 — the 15-min step the event wizard enforces),
 * so a time can be picked with two taps and no keyboard or dropdown. Used below
 * the `TimePicker` (which stays for exact/typed values) on the event wizard's
 * Start & End step.
 *
 * The value stays a single `HH:mm` string (or "" when unset): tapping an hour
 * keeps the current minute (defaulting to "00"), and tapping a minute keeps the
 * current hour (defaulting to "08", the start of the common working day).
 */
export function TimeChipSelector({
  value,
  onChange,
  label,
}: {
  /** The current `HH:mm` time, or "" when none is set. */
  value: string;
  onChange: (time: string) => void;
  label?: string;
}) {
  const hour = value ? value.slice(0, 2) : "";
  const minute = value ? value.slice(3, 5) : "";

  return (
    <div>
      {label ? (
        <Text size="sm" fw={500} mb={4}>
          {label}
        </Text>
      ) : null}
      <Group align="center" gap={6} wrap="nowrap">
        <Text size="xs" c="dimmed" fw={600} w={12}>
          H
        </Text>
        <div className="c2-chip-scroll">
          {HOURS.map((h) => (
            <TimeChip
              key={h}
              selected={h === hour}
              label={h}
              ariaLabel={`${Number(h)} o'clock`}
              onClick={() => onChange(`${h}:${minute || "00"}`)}
            />
          ))}
        </div>
      </Group>
      <Group align="center" gap={6} wrap="nowrap" mt={6}>
        <Text size="xs" c="dimmed" fw={600} w={12}>
          M
        </Text>
        {MINUTES.map((m) => (
          <TimeChip
            key={m}
            selected={m === minute}
            label={m}
            ariaLabel={`${m} minutes past the hour`}
            onClick={() => onChange(`${hour || "08"}:${m}`)}
          />
        ))}
      </Group>
    </div>
  );
}

function TimeChip({
  selected,
  label,
  ariaLabel,
  onClick,
}: {
  selected: boolean;
  label: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <UnstyledButton
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={onClick}
      style={{ cursor: "pointer", borderRadius: "var(--mantine-radius-md)" }}
    >
      <Badge variant={selected ? "filled" : "light"} size="lg">
        {label}
      </Badge>
    </UnstyledButton>
  );
}
