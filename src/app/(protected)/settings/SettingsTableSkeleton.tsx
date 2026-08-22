"use client";

import type { PaperProps } from "@mantine/core";
import { Paper, Skeleton, Table } from "@mantine/core";

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
