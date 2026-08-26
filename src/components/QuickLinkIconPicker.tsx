"use client";

import { ActionIcon, Group, Tooltip, useMantineTheme } from "@mantine/core";

import { QUICK_LINK_ICONS } from "@/lib/quickLinks/icons";
import { QuickLinkIcon } from "./QuickLinkIcon";

const ICON_BUTTON_SIZE = 40;

interface QuickLinkIconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

/**
 * Tappable grid of the curated quick-link icons. Plain icon buttons — not a
 * Select — so tapping on mobile never raises the keyboard (same rationale as
 * the color swatches and the department badges in the user form).
 */
export function QuickLinkIconPicker({ value, onChange }: QuickLinkIconPickerProps) {
  const theme = useMantineTheme();
  return (
    <Group gap={6} wrap="wrap">
      {QUICK_LINK_ICONS.map(({ key, label }) => (
        <Tooltip key={key} label={label} position="top" withArrow>
          <ActionIcon
            variant={value === key ? "filled" : "light"}
            color={value === key ? theme.primaryColor : "gray"}
            size={ICON_BUTTON_SIZE}
            aria-label={label}
            aria-pressed={value === key}
            onClick={() => onChange(key)}
          >
            <QuickLinkIcon iconKey={key} size={20} />
          </ActionIcon>
        </Tooltip>
      ))}
    </Group>
  );
}
