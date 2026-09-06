"use client";

import type { ReactNode } from "react";
import { Badge, Button, Group, Stack, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";

/** One resolved summary badge: the caller maps its own id domain to these. */
export interface PickerBadgeItem {
  key: string;
  label: string;
  /** Mantine color name (e.g. "brand"/"accent"); undefined = default badge color. */
  color?: string;
}

export interface PickerBadgesProps {
  items: PickerBadgeItem[];
  /** Max badges rendered before a "+N" overflow badge; default: no cap. */
  cap?: number;
  /** Shown in place of the badges when items is empty. */
  empty?: ReactNode;
}

/**
 * The summary layer shared by every UserSelectModal consumer: a wrapped row of
 * `variant="light"` badges for the currently picked options, with an optional
 * overflow cap and an empty-state placeholder. Purely presentational — opening
 * the dialog is the caller's job (each caller owns its modal + confirm wiring).
 */
export function PickerBadges({ items, cap, empty }: PickerBadgesProps) {
  if (items.length === 0) {
    return empty ?? null;
  }
  const visible = cap === undefined ? items : items.slice(0, cap);
  const overflow = items.length - visible.length;
  return (
    <Group gap={6} wrap="wrap">
      {visible.map((item) => (
        <Badge key={item.key} variant="light" color={item.color}>
          {item.label}
        </Badge>
      ))}
      {overflow > 0 && <Badge variant="light">+{overflow}</Badge>}
    </Group>
  );
}

export interface PickerFieldProps extends PickerBadgesProps {
  /** Omit to render the trigger + summary without a header row. */
  label?: ReactNode;
  /** Appended to the label as "(N)". */
  count?: number;
  /** Dimmed hint under the header row (e.g. what tagging a person means). */
  description?: ReactNode;
  /** Trigger button label; default "Select". */
  triggerLabel?: string;
  /** Opens the caller's UserSelectModal. */
  onOpen: () => void;
}

/**
 * A labelled user/department picker row: an optional header (label + count +
 * description) with the trigger button pinned right, then the PickerBadges
 * summary. Shared by the event wizard's invitees, KAH member fields, and the
 * Double Booking admin target; FilterModal composes PickerBadges directly for
 * its search-group summaries.
 */
export function PickerField({
  label,
  count,
  description,
  items,
  cap,
  empty,
  triggerLabel = "Select",
  onOpen,
}: PickerFieldProps) {
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
        {label !== undefined && (
          <Text fw={600} size="sm">
            {label}
            {count !== undefined ? ` (${count})` : ""}
          </Text>
        )}
        <Button
          type="button"
          size="xs"
          variant="light"
          leftSection={<IconPlus size={14} />}
          onClick={onOpen}
        >
          {triggerLabel}
        </Button>
      </Group>
      {description !== undefined && (
        <Text size="xs" c="dimmed">
          {description}
        </Text>
      )}
      <PickerBadges items={items} cap={cap} empty={empty} />
    </Stack>
  );
}
