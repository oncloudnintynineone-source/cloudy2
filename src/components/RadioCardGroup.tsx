"use client";

import type { ReactNode } from "react";
import { Group, Radio, Stack, Text } from "@mantine/core";

export interface RadioCardOption {
  value: string;
  label: string;
  /** Optional second line inside the row (dimmed, wraps). */
  description?: string;
}

export interface RadioCardGroupProps {
  /** Visible group label, which also names the `radiogroup` for assistive tech. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Options in display order; callers filter to the values they may offer. */
  options: readonly RadioCardOption[];
  /** Optional dimmed line under the label (`aria-describedby`-linked). */
  description?: ReactNode;
  disabled?: boolean;
}

/**
 * The app's one **touch-sized choice list**: full-width radio "rows" instead of
 * bare Mantine `Radio`s. A plain radio row is a 20px indicator beside a 14px
 * label — ~24px tall, well under the 44px fingertip floor, which is a real miss
 * risk on the calendar page's series-scope choosers (docs/accessibility.md
 * §1.9). Each option here is a borderless `Radio.Card`: the whole row (≥ 48px
 * tall, the dialog's full width) is the tap target, the indicator grows to
 * 24px, and the selected row carries a brand tint + the indicator's filled dot
 * so the choice is readable at a glance in both colour schemes
 * (`.c2-radio-card` in `globals.css`).
 *
 * Semantics come from Mantine: `Radio.Group` renders a `radiogroup` named by
 * `label`, each card is a `role="radio"` button with `aria-checked`, and the
 * cards are roving — Up/Down/Left/Right move and select. Stacking rows rather
 * than laying them out horizontally is deliberate: a horizontal card row would
 * shrink each option below 44px wide on a 360px phone.
 */
export function RadioCardGroup({
  label,
  value,
  onChange,
  options,
  description,
  disabled = false,
}: RadioCardGroupProps) {
  return (
    <Radio.Group
      label={label}
      description={description}
      value={value}
      onChange={onChange}
      disabled={disabled}
    >
      <Stack gap={8} mt={6}>
        {options.map((option) => (
          <Radio.Card
            key={option.value}
            value={option.value}
            className="c2-radio-card"
            withBorder={false}
            disabled={disabled}
          >
            <Group gap="sm" align="center" wrap="nowrap">
              <Radio.Indicator size="md" />
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={500}>
                  {option.label}
                </Text>
                {option.description ? (
                  <Text size="xs" c="dimmed" lh={1.35}>
                    {option.description}
                  </Text>
                ) : null}
              </div>
            </Group>
          </Radio.Card>
        ))}
      </Stack>
    </Radio.Group>
  );
}
