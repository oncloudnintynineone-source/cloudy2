"use client";

import { Group, Paper, SimpleGrid, Stack, Text, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconCheck } from "@tabler/icons-react";

import { DASHBOARD_VIEW_KINDS, type DashboardViewKind } from "@/lib/dashboardViews/views";
import { NARROW_MEDIA_QUERY } from "@/lib/theme";

import { VIEW_TAB_META } from "./viewMeta";

interface ViewTypePickerProps {
  /** The currently highlighted kind. */
  value: DashboardViewKind;
  /** A kind that must not change away from (the row being edited's own
   *  kind) — shown, ticked and disabled. */
  disabledKind?: DashboardViewKind;
  onSelect: (kind: DashboardViewKind) => void;
  /**
   * `"text"` (default) renders the compact vertical row list — used when
   * editing an existing view. `"thumbnail"` renders a grid of SVG wireframe
   * previews — used by the "Add view" dialog.
   */
  variant?: "text" | "thumbnail";
}

/**
 * The shared seven-kind picker (Month / Week (H) / Week (D) / Week (Grid) /
 * Day / Agenda / Month & Agenda) used by the "Add view" dialog and the
 * Manage views modal's "Edit view" dialog. Selecting a row calls `onSelect`;
 * the disabled row marks the current kind when the picker edits an existing
 * view.
 */
export function ViewTypePicker({
  value,
  disabledKind,
  onSelect,
  variant = "text",
}: ViewTypePickerProps) {
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);

  if (variant === "thumbnail") {
    return (
      <SimpleGrid cols={isNarrow ? 1 : { base: 2, sm: 3 }} spacing="sm">
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
              className="c2-viewp-card"
              style={{ display: "block" }}
            >
              <Paper
                withBorder
                radius="md"
                p={6}
                bg={selected ? "var(--mantine-color-accent-light)" : undefined}
                style={{
                  borderColor: selected ? "var(--mantine-color-accent-4)" : undefined,
                  opacity: disabled ? 0.5 : undefined,
                  cursor: disabled ? "not-allowed" : undefined,
                }}
              >
                <div className="c2-viewp-thumb-wrap">
                  <div className="c2-viewp-thumb" style={{ color: "var(--mantine-color-gray-6)" }}>
                    {meta.thumbnail}
                  </div>
                  {selected && (
                    <span className="c2-viewp-check" aria-hidden>
                      <IconCheck size={12} />
                    </span>
                  )}
                </div>
                <Text fw={selected ? 700 : 500} size="xs" ta="center" mt={6} truncate>
                  {meta.label}
                  {disabled && " (current)"}
                </Text>
              </Paper>
            </UnstyledButton>
          );
        })}
      </SimpleGrid>
    );
  }

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
