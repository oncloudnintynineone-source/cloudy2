"use client";

import type { ReactNode } from "react";
import { Box, Checkbox, Group, Text } from "@mantine/core";

export interface SelectableRowProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  /** Marks the signed-in user with the amber "(You)" suffix (same word as the badges). */
  self?: boolean;
  disabled?: boolean;
  /**
   * Right-aligned state for the row (a section count, a department tally). It
   * supplements the indicator — it is never the only cue.
   */
  trailing?: ReactNode;
}

/**
 * The app's second **touch-sized choice row**: the multi-select twin of
 * `RadioCardGroup` (same `.c2-radio-card` recipe — full-width borderless card,
 * ≥ 44px tall, 24px indicator, brand tint when checked), built on
 * `Checkbox.Card` so Mantine supplies `role="checkbox"` + `aria-checked` and
 * Space toggles.
 *
 * Where `SelectableBadge` deliberately has no check glyph (a reserved slot
 * shifted every unselected chip's label), a **row** has a permanent indicator
 * column, so nothing moves and the state survives greyscale — which is exactly
 * what the filter dialog needed: its badges communicated selection by amber fill
 * alone and its folder chips by a yellow border alone (WCAG 1.4.1).
 *
 * Long labels (a department's full ancestor chain) wrap and grow the row rather
 * than ellipsizing, so nothing is only reachable by hover.
 */
export function SelectableRow({
  label,
  selected,
  onToggle,
  self = false,
  disabled = false,
  trailing,
}: SelectableRowProps) {
  return (
    <Checkbox.Card
      className="c2-check-row"
      withBorder={false}
      checked={selected}
      onChange={onToggle}
      disabled={disabled}
    >
      <Group gap="sm" align="center" wrap="nowrap">
        <Checkbox.Indicator size="md" />
        <div style={{ minWidth: 0 }}>
          <Text
            size="sm"
            fw={500}
            styles={{
              root: { whiteSpace: "normal", overflow: "visible", textOverflow: "clip", lineHeight: 1.3 },
            }}
          >
            {self ? `${label} (You)` : label}
          </Text>
        </div>
        {trailing ? (
          <Box component="span" ml="auto" style={{ flexShrink: 0 }}>
            {trailing}
          </Box>
        ) : null}
      </Group>
    </Checkbox.Card>
  );
}
