import { Group, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";

import { DASHBOARD_VIEW_KINDS, type DashboardViewKind } from "@/lib/dashboardViews/views";

import { VIEW_TAB_META } from "./viewMeta";

interface ViewTypePickerProps {
  /** The currently highlighted kind. */
  value: DashboardViewKind;
  /** A kind that must not change away from (the row being edited's own
   *  kind) — shown, ticked and disabled. */
  disabledKind?: DashboardViewKind;
  onSelect: (kind: DashboardViewKind) => void;
}

/**
 * The shared seven-kind picker (Month / Week (H) / Week (D) / Week (Grid) /
 * Day / Agenda / Month & Agenda) used by the "Add view" dialog and the
 * Manage views modal's "Edit view"
 * dialog. Selecting a row calls `onSelect`; the disabled row marks the current
 * kind when the picker edits an existing view.
 */
export function ViewTypePicker({ value, disabledKind, onSelect }: ViewTypePickerProps) {
  return (
    <Stack gap={6}>
      {DASHBOARD_VIEW_KINDS.map((kind) => {
        const meta = VIEW_TAB_META[kind];
        const selected = value === kind;
        const disabled = disabledKind === kind;
        return (
          <UnstyledButton
            key={kind}
            disabled={disabled}
            onClick={() => onSelect(kind)}
            aria-pressed={selected}
            data-disabled={disabled || undefined}
          >
            <Paper
              withBorder
              p="xs"
              radius="md"
              bg={selected ? "var(--mantine-color-accent-light)" : undefined}
              style={{
                borderColor: selected ? "var(--mantine-color-accent-4)" : undefined,
                opacity: disabled ? 0.5 : undefined,
                cursor: disabled ? "not-allowed" : undefined,
              }}
            >
              <Group gap="sm" wrap="nowrap">
                {meta.icon}
                <Text fw={selected ? 700 : 500} size="sm" style={{ flex: 1 }}>
                  {meta.label}
                  {disabled && " (current)"}
                </Text>
                {selected && <IconCheck size={16} color="var(--mantine-color-accent-6)" />}
              </Group>
            </Paper>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}
