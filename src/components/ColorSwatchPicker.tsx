"use client";

import { type CSSProperties } from "react";
import { Group, type MantineTheme, UnstyledButton, useMantineTheme } from "@mantine/core";

import { EVENT_COLORS, colorForId } from "@/lib/events/eventColors";

const SWATCH_SIZE = 26;

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * The fill for a color swatch. "Auto" (null) is a conic gradient of the whole
 * palette so it reads as "any color".
 */
function swatchFill(color: string | null, theme: MantineTheme): string {
  if (color && theme.colors[color]) {
    return theme.colors[color][4];
  }
  const stops = EVENT_COLORS.map((c) => theme.colors[c][4]).join(", ");
  return `conic-gradient(${stops}, ${theme.colors.blue[4]})`;
}

/** The small color chip used in settings lists. */
export function ColorDot({ color, size = 12 }: { color: string | null; size?: number }) {
  const theme = useMantineTheme();
  const style: CSSProperties = {
    display: "inline-block",
    width: size,
    height: size,
    borderRadius: "50%",
    background: swatchFill(color, theme),
    flexShrink: 0,
  };
  return <span style={style} />;
}

/**
 * Tap-friendly color swatches for the event type and department forms:
 * "Auto" (the deterministic default derived from autoRefId — the event type
 * name or calendar id) plus the fixed palette. Plain buttons — not inputs —
 * so tapping never raises the mobile keyboard.
 */
export function ColorSwatchPicker({
  value,
  onChange,
  autoRefId,
}: {
  value: string;
  onChange: (color: string) => void;
  autoRefId: string | null;
}) {
  const theme = useMantineTheme();
  const autoLabel = autoRefId ? `Auto (${capitalize(colorForId(autoRefId))})` : "Auto";
  const options = [
    { key: "", label: autoLabel },
    ...EVENT_COLORS.map((color) => ({ key: color as string, label: capitalize(color) })),
  ];

  return (
    <Group gap={8} wrap="wrap">
      {options.map((option) => {
        const selected = value === option.key;
        return (
          <UnstyledButton
            key={option.key || "auto"}
            aria-pressed={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.key)}
            style={{
              width: SWATCH_SIZE,
              height: SWATCH_SIZE,
              borderRadius: "50%",
              background: swatchFill(option.key || null, theme),
              outline: selected ? `3px solid ${theme.colors[theme.primaryColor][4]}` : "none",
              outlineOffset: 2,
            }}
          />
        );
      })}
    </Group>
  );
}
