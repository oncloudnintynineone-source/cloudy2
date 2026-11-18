"use client";

import type { ReactNode } from "react";
import { ActionIcon, Badge, Box, Group, Paper, Stack, Text } from "@mantine/core";
import { IconX } from "@tabler/icons-react";

import type { DepartmentAccessRole } from "@/lib/roster/shares";
import { isAccessRole } from "@/lib/roster/accessEditor";
import { NoKeyboardSelect } from "./NoKeyboardSelect";
import { ROW_ACTION_ICON_SIZE, ROW_ACTION_SIZE } from "./reorderUpDown";

/**
 * The shared row recipe for the two roster access managers — Users → "Department
 * access" and Departments → "Calendar access". Both list *someone × a calendar ×
 * an access level*, so they render the same row: a bordered `Paper`, a title
 * with an optional dimmed subtitle, an optional badge, the level control (or a
 * read-only badge), and an optional remove action. Keeping it here is what stops
 * the two modals drifting apart again the way the role vocabulary did.
 */

/** The selectable levels, in the order they are offered. */
export const ACCESS_ROLE_OPTIONS: { value: DepartmentAccessRole; label: string }[] = [
  { value: "reader", label: "Read only" },
  { value: "writer", label: "Can edit" },
  { value: "owner", label: "Owner" },
];

const ACCESS_ROLE_LABELS: Record<DepartmentAccessRole, string> = {
  reader: "Read only",
  writer: "Can edit",
  owner: "Owner",
};

/** Badge fills per level — brand for the strongest level the app hands out. */
const ACCESS_ROLE_BADGE_COLORS: Record<DepartmentAccessRole, string> = {
  owner: "brand",
  writer: "blue",
  reader: "gray",
};

/** Human label for a level; unknown values (a raw Google ACL) pass through. */
export function accessRoleLabel(role: string | null | undefined): string {
  if (!role) return ACCESS_ROLE_LABELS.reader;
  return isAccessRole(role) ? ACCESS_ROLE_LABELS[role] : role;
}

export interface AccessRoleBadgeProps {
  role: string | null | undefined;
  /** Extra words after the level, e.g. the email it belongs to. */
  ariaLabel?: string;
}

/** Read-only level chip for rows the user cannot edit here. */
export function AccessRoleBadge({ role, ariaLabel }: AccessRoleBadgeProps) {
  const color = isAccessRole(role) ? ACCESS_ROLE_BADGE_COLORS[role] : "gray";
  return (
    <Badge variant="light" color={color} aria-label={ariaLabel} style={{ flexShrink: 0 }}>
      {accessRoleLabel(role)}
    </Badge>
  );
}

export interface AccessLevelSelectProps {
  value: string | null | undefined;
  onChange: (role: DepartmentAccessRole) => void;
  /** Names the row the control belongs to for screen readers. */
  ariaLabel: string;
  loading?: boolean;
  disabled?: boolean;
  /** Row controls are narrow by design; override only for a wider layout. */
  width?: number;
}

/**
 * The level dropdown used inside an access row. Non-searchable, so it is safe to
 * render directly, but it goes through `NoKeyboardSelect` like every other
 * dropdown in the app.
 */
export function AccessLevelSelect({
  value,
  onChange,
  ariaLabel,
  loading,
  disabled,
  width = 132,
}: AccessLevelSelectProps) {
  return (
    <NoKeyboardSelect
      size="xs"
      w={width}
      allowDeselect={false}
      data={ACCESS_ROLE_OPTIONS}
      value={isAccessRole(value) ? value : null}
      onChange={(next) => {
        if (isAccessRole(next)) onChange(next);
      }}
      aria-label={ariaLabel}
      loading={loading}
      disabled={disabled}
      style={{ flexShrink: 0 }}
    />
  );
}

export interface AccessRowProps {
  title: ReactNode;
  /** Dimmed second line: an email, a department path, or a hint. */
  subtitle?: ReactNode;
  /** Chip next to the title, e.g. "Their department". */
  badge?: ReactNode;
  /** The right-hand control: a level select, a read-only badge, or nothing. */
  trailing?: ReactNode;
  /** Omit for a row that cannot be removed here. */
  onRemove?: () => void;
  removeAriaLabel?: string;
  removeLoading?: boolean;
}

/** One access row: title (+ subtitle) on the left, level control and remove on the right. */
export function AccessRow({
  title,
  subtitle,
  badge,
  trailing,
  onRemove,
  removeAriaLabel,
  removeLoading,
}: AccessRowProps) {
  return (
    <Paper withBorder p="xs" radius="md">
      <Group justify="space-between" wrap="nowrap" align="center" gap="sm">
        <AccessRowLabel title={title} badge={badge} subtitle={subtitle} />
        <Group gap="xs" wrap="nowrap">
          {trailing}
          {onRemove ? (
            <ActionIcon
              variant="light"
              color="red"
              size={ROW_ACTION_SIZE}
              aria-label={removeAriaLabel}
              title={removeAriaLabel}
              loading={removeLoading}
              loaderProps={{ type: "oval" }}
              onClick={onRemove}
            >
              <IconX size={ROW_ACTION_ICON_SIZE} />
            </ActionIcon>
          ) : null}
        </Group>
      </Group>
    </Paper>
  );
}

/** Left half of an `AccessRow`: title + badge on one line, optional dimmed line below. */
function AccessRowLabel({
  title,
  badge,
  subtitle,
}: {
  title: ReactNode;
  badge?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <Stack gap={0} flex={1} style={{ minWidth: 0 }}>
      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
        <Text size="sm" fw={600} style={{ wordBreak: "break-word" }}>
          {title}
        </Text>
        {badge ? <Box style={{ flexShrink: 0 }}>{badge}</Box> : null}
      </Group>
      {subtitle ? (
        <Text size="xs" c="dimmed" style={{ wordBreak: "break-word" }}>
          {subtitle}
        </Text>
      ) : null}
    </Stack>
  );
}
