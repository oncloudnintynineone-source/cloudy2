"use client";

import type { PaperProps } from "@mantine/core";
import { Group, Paper, Skeleton, Table, Stack } from "@mantine/core";

import { LoadingStatus } from "./LoadingStatus";

interface SettingsTableSkeletonProps extends PaperProps {
  /** Relative width of each column (normalized to the table width). */
  columns: number[];
  /** Number of body rows (default 6). */
  rows?: number;
}

/** Desktop table skeleton matching the settings list tables' shape. */
export function SettingsTableSkeleton({ columns, rows = 6, ...rest }: SettingsTableSkeletonProps) {
  const total = columns.reduce((sum, width) => sum + width, 0);
  const widths = columns.map((width) => `${((width / total) * 100).toFixed(2)}%`);
  return (
    <Paper withBorder {...rest}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            {widths.map((width, i) => (
              <Table.Th key={i}>
                <Skeleton height={12} style={{ width }} />
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {Array.from({ length: rows }, (_, row) => (
            <Table.Tr key={row}>
              {widths.map((width, i) => (
                <Table.Td key={i}>
                  <Skeleton height={16} style={{ width }} />
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}

interface CrudTabSkeletonProps {
  /** Screen-reader announcement. */
  label: string;
  /** Desktop table column weights. */
  columns: number[];
  rows?: number;
  mobileRows?: number;
  /** Width of the desktop "Add …" button skeleton. */
  addWidth?: number;
}

/**
 * The shared loading shape of the simple settings CRUD tabs (Quick Links,
 * Webhooks, KAH Groups): mobile card list, desktop add-button row, desktop
 * table. The card bodies are deliberately generic — the real lists differ in
 * their badge/URL combination and the skeleton only covers the first paint.
 */
export function CrudTabSkeleton({
  label,
  columns,
  rows = 4,
  mobileRows = 3,
  addWidth = 140,
}: CrudTabSkeletonProps) {
  return (
    <Stack pb="xl" gap="sm">
      <LoadingStatus label={label} />
      <Stack gap="sm" hiddenFrom="lg">
        {Array.from({ length: mobileRows }, (_, i) => (
          <Paper key={i} withBorder p="sm">
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap">
                <Skeleton height={20} width="45%" />
                <Skeleton height={20} width={72} radius="xl" />
              </Group>
              <Skeleton height={16} width="70%" />
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Paper withBorder p="sm" visibleFrom="lg">
        <Group justify="flex-end" wrap="nowrap">
          <Skeleton width={addWidth} height={43} />
        </Group>
      </Paper>

      <SettingsTableSkeleton columns={columns} rows={rows} visibleFrom="lg" />
    </Stack>
  );
}
