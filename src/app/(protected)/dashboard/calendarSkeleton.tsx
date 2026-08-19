"use client";

import dayjs from "dayjs";
import { Box, Group, Paper, Skeleton } from "@mantine/core";

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 3,
} as const;

/** Full week rows a consistent 7-column month grid renders for the month. */
export function monthGridRows(month: string): number {
  const first = dayjs(`${month}-01 00:00:00`);
  return Math.ceil((first.day() + first.daysInMonth()) / 7);
}

export function WeekdayRow() {
  return (
    <Box style={gridStyle} mb={4}>
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} height={12} radius={3} style={{ width: "55%", margin: "0 auto" }} />
      ))}
    </Box>
  );
}

export function MonthGridSkeleton({ rows }: { rows: number }) {
  return (
    <Paper withBorder radius="md" p="sm">
      <WeekdayRow />
      <Box style={gridStyle}>
        {Array.from({ length: rows * 7 }).map((_, i) => {
          const chips = (Math.floor(i / 7) * 3 + (i % 7) * 5 + 2) % 4;
          return (
            <Paper
              key={i}
              withBorder
              radius="sm"
              p={4}
              style={{
                minHeight: 124,
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              <Skeleton height={12} width={16} style={{ alignSelf: "flex-end" }} />
              {Array.from({ length: chips }).map((_, c) => (
                <Skeleton key={c} height={20} radius={2} />
              ))}
            </Paper>
          );
        })}
      </Box>
    </Paper>
  );
}

/** Stacked resource rows matching the Schedule view shape (label + day lane). */
export function ScheduleGridSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Box style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: rows }).map((_, i) => {
          const eventBars = (i * 3 + 1) % 3;
          return (
            <Group key={i} gap="xs" wrap="nowrap">
              <Skeleton width={48} height={44} radius={4} />
              <Box style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                {Array.from({ length: eventBars }).map((_, b) => (
                  <Skeleton key={b} height={22} radius={3} style={{ width: "72%" }} />
                ))}
                <Skeleton height={10} radius={2} style={{ width: "100%" }} />
              </Box>
            </Group>
          );
        })}
      </Box>
    </Paper>
  );
}

/** Stacked resource rows matching the Week view shape (label + 7-day lane). */
export function WeekGridSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Paper withBorder radius="md" p="sm">
      <WeekdayRow />
      <Box style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <Group key={i} gap="xs" wrap="nowrap" align="stretch">
            <Skeleton width={48} height={44} radius={4} style={{ flexShrink: 0 }} />
            <Box
              style={{
                flex: 1,
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                alignItems: "stretch",
              }}
            >
              {Array.from({ length: 7 }).map((_, c) => {
                // Deterministic 1-2 event bars per row, varying with the row index.
                const hasBar = (i * 3 + c) % 7 < 2;
                return (
                  <Box
                    key={c}
                    style={{
                      height: 44,
                      borderInlineStart:
                        c > 0 ? "1px solid var(--mantine-color-default-border)" : undefined,
                      display: "flex",
                      alignItems: "center",
                      paddingInline: 2,
                    }}
                  >
                    {hasBar && <Skeleton height={18} radius={3} style={{ width: "100%" }} />}
                  </Box>
                );
              })}
            </Box>
          </Group>
        ))}
      </Box>
    </Paper>
  );
}
