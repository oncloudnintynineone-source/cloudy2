"use client";

import type { ReactNode } from "react";
import { ActionIcon, Badge, Button, Group, Stack, Text } from "@mantine/core";
import { IconPencil, IconPlus, IconX } from "@tabler/icons-react";

import { pickerRemovalHint, pickerTriggerLabel } from "@/lib/ui/picker";

/** One resolved summary badge: the caller maps its own id domain to these. */
export interface PickerBadgeItem {
  key: string;
  label: string;
  /** Mantine color name (e.g. "brand"/"accent"); undefined = default badge color. */
  color?: string;
  /**
   * True when this badge names the signed-in user: it renders as the amber
   * "mine" badge (ring + cream tint + "(You)" suffix) and ignores `color`.
   */
  self?: boolean;
}

export interface PickerBadgesProps {
  items: PickerBadgeItem[];
  /** Max badges rendered before a "+N" overflow badge; default: no cap. */
  cap?: number;
  /** Shown in place of the badges when items is empty. */
  empty?: ReactNode;
  /**
   * Renders a ✕ on every visible chip that removes that pick **in place** — the
   * one-tap removal users look for before they ever think of reopening the
   * dialog. The `+N` overflow badge stays inert (its hidden picks are removed
   * inside the dialog, where they are named).
   */
  onRemove?: (item: PickerBadgeItem) => void;
  /** Overrides the remove control's accessible name (default `Remove <label>`). */
  removeLabel?: (item: PickerBadgeItem) => string;
}

/**
 * The summary layer shared by every UserSelectModal consumer: a wrapped row of
 * `variant="light"` badges for the currently picked options, with an optional
 * overflow cap, an empty-state placeholder and an optional per-chip remove
 * control. Purely presentational — opening the dialog is the caller's job (each
 * caller owns its modal + confirm wiring).
 */
export function PickerBadges({
  items,
  cap,
  empty,
  onRemove,
  removeLabel,
}: PickerBadgesProps) {
  if (items.length === 0) {
    return empty ?? null;
  }
  const visible = cap === undefined ? items : items.slice(0, cap);
  const overflow = items.length - visible.length;
  const removable = onRemove !== undefined;
  // A removable chip carries a ✕, so every chip in the row grows to a
  // comfortable 28px together — one even row, and a real touch target.
  const chipStyles = removable ? { root: { minHeight: 28 } } : undefined;
  return (
    <Group gap={6} wrap="wrap">
      {visible.map((item) => {
        const label = item.self ? `${item.label} (You)` : item.label;
        const removeName = removeLabel?.(item) ?? `Remove ${label}`;
        return (
          <Badge
            key={item.key}
            variant="light"
            color={item.self ? undefined : item.color}
            className={item.self ? "c2-my-badge" : undefined}
            styles={chipStyles}
            rightSection={
              removable ? (
                <ActionIcon
                  // The chip is not itself a control; only the ✕ acts.
                  className="c2-picker-chip-remove"
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label={removeName}
                  title={removeName}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(item);
                  }}
                >
                  <IconX size={14} />
                </ActionIcon>
              ) : undefined
            }
          >
            {label}
          </Badge>
        );
      })}
      {overflow > 0 && <Badge variant="light" styles={chipStyles}>+{overflow}</Badge>}
    </Group>
  );
}

export interface PickerTriggerProps {
  /** How many options are already picked — decides Add vs Edit wording. */
  count: number;
  /** Opens the caller's UserSelectModal. */
  onOpen: () => void;
  /** Explicit label; wins over the state-dependent Add/Edit pair. */
  triggerLabel?: string;
  /** Label while nothing is picked (default "Add"). */
  addLabel?: string;
  /** Label once something is picked (default "Edit"). */
  editLabel?: string;
}

/**
 * The picker's trigger button, shared by `PickerField` and the filter dialog's
 * search groups so the two can never drift: it says **Add** with a `+` while
 * nothing is picked and **Edit** with a pencil afterwards. A trigger that keeps
 * reading "Select +" after people are already tagged is exactly what made users
 * believe the dialog could only add (docs/user-picker.md §1.7).
 */
export function PickerTrigger({
  count,
  onOpen,
  triggerLabel,
  addLabel,
  editLabel,
}: PickerTriggerProps) {
  const picked = count > 0;
  return (
    <Button
      type="button"
      size="xs"
      variant="light"
      leftSection={picked ? <IconPencil size={14} /> : <IconPlus size={14} />}
      onClick={onOpen}
    >
      {triggerLabel ?? pickerTriggerLabel(count, { addLabel, editLabel })}
    </Button>
  );
}

export interface PickerFieldProps extends PickerBadgesProps {
  /** Omit to render the trigger + summary without a header row. */
  label?: ReactNode;
  /** Appended to the label as "(N)"; also drives the trigger's Add/Edit state. */
  count?: number;
  /** Dimmed hint under the header row (e.g. what tagging a person means). */
  description?: ReactNode;
  /** Set false to drop the automatic "tap ✕ to remove" line. */
  showRemovalHint?: boolean;
  /** Explicit trigger label; wins over the Add/Edit pair. */
  triggerLabel?: string;
  /** Label while nothing is picked (default "Add"). */
  addLabel?: string;
  /** Label once something is picked (default "Edit"). */
  editLabel?: string;
  /** Opens the caller's UserSelectModal. */
  onOpen: () => void;
}

/**
 * A labelled user/department picker row: an optional header (label + count +
 * description) with the state-dependent `PickerTrigger` pinned right, then the
 * `PickerBadges` summary and the removal hint. Shared by the event wizard's
 * invitees, KAH member fields, and the Double Booking scan target; FilterModal
 * composes `PickerBadges` + `PickerTrigger` directly for its search groups.
 */
export function PickerField({
  label,
  count,
  description,
  showRemovalHint = true,
  items,
  cap,
  empty,
  onRemove,
  removeLabel,
  triggerLabel,
  addLabel,
  editLabel,
  onOpen,
}: PickerFieldProps) {
  const hint = showRemovalHint ? pickerRemovalHint(items.length) : "";
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
        {label !== undefined && (
          <Text fw={600} size="sm">
            {label}
            {count !== undefined ? ` (${count})` : ""}
          </Text>
        )}
        <PickerTrigger
          count={count ?? items.length}
          onOpen={onOpen}
          triggerLabel={triggerLabel}
          addLabel={addLabel}
          editLabel={editLabel}
        />
      </Group>
      {description !== undefined && (
        <Text size="xs" c="dimmed">
          {description}
        </Text>
      )}
      <PickerBadges
        items={items}
        cap={cap}
        empty={empty}
        onRemove={onRemove}
        removeLabel={removeLabel}
      />
      {hint !== "" && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Stack>
  );
}
