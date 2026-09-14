"use client";

import { Box, Group, Paper, Skeleton, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

import { monthGridRows } from "@/lib/events/datetime";

export { monthGridRows };

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 3,
} as const;

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

/** Stacked list matching the Agenda view shape (date header + event rows). */
export function AgendaListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Paper withBorder radius="md" p={0} style={{ overflow: "hidden" }}>
      <Box style={{ padding: "var(--mantine-spacing-xs) var(--mantine-spacing-sm)" }}>
        <Skeleton height={14} width="45%" />
      </Box>
      {Array.from({ length: rows }).map((_, i) => (
        <Group
          key={i}
          gap="sm"
          wrap="nowrap"
          align="center"
          style={{
            padding: "var(--mantine-spacing-xs) var(--mantine-spacing-sm)",
            borderTop: "1px solid var(--mantine-color-default-border)",
          }}
        >
          <Skeleton width={4} height={30} radius={2} style={{ flexShrink: 0 }} />
          <Box style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <Skeleton height={14} radius={2} style={{ width: `${60 - (i % 3) * 10}%` }} />
            <Skeleton height={10} radius={2} style={{ width: "35%" }} />
          </Box>
        </Group>
      ))}
    </Paper>
  );
}

const WEEK_GRID_BORDER = "1px solid var(--mantine-color-default-border)";

/**
 * Week (Grid) skeleton: a conventional week grid shape — a day-header band over
 * a time-label column plus 7 day columns with hour rows and deterministic event
 * blocks. Mirrors the real `WeekView` layout so the swap on load is seamless.
 */
export function WeekGridViewSkeleton({
  hours = 8,
  chromeOffset,
}: {
  hours?: number;
  /** Measured chrome height — the real grid is viewport-bounded (it scrolls
   *  internally with a pinned header + all-day row), so the placeholder fills
   *  the same box to keep the swap seamless. */
  chromeOffset: number;
}) {
  const columns = "3rem repeat(7, 1fr)";
  return (
    <Paper
      withBorder
      radius="md"
      p={0}
      style={{
        overflow: "hidden",
        height: `calc(var(--app-shell-vh, 100dvh) - var(--app-shell-header-offset) - var(--app-shell-footer-offset) - var(--mantine-spacing-sm) - var(--c2-weekgrid-bottom-budget, 0px) - ${chromeOffset}px)`,
      }}
    >
      {/* Day-header band: corner cell + 7 weekday/day-number placeholders. */}
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: columns,
          borderBottom: WEEK_GRID_BORDER,
        }}
      >
        <Box style={{ borderRight: WEEK_GRID_BORDER }} />
        {Array.from({ length: 7 }).map((_, c) => (
          <Box
            key={c}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "5px 2px",
              borderLeft: c > 0 ? WEEK_GRID_BORDER : undefined,
            }}
          >
            <Skeleton height={10} radius={2} style={{ width: "55%" }} />
            <Skeleton height={8} radius={2} style={{ width: "25%" }} />
          </Box>
        ))}
      </Box>

      {/* Hour rows: time-label cell + 7 day cells; a few deterministic events. */}
      {Array.from({ length: hours }).map((_, r) => (
        <Box
          key={r}
          style={{
            display: "grid",
            gridTemplateColumns: columns,
            borderBottom: r < hours - 1 ? WEEK_GRID_BORDER : undefined,
          }}
        >
          <Box
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "flex-end",
              padding: "4px 6px",
              borderRight: WEEK_GRID_BORDER,
            }}
          >
            <Skeleton height={8} radius={2} style={{ width: "70%" }} />
          </Box>
          {Array.from({ length: 7 }).map((_, c) => {
            // Deterministic 0-2 event blocks per cell, varying with row/column.
            const blocks = (r * 3 + c * 5) % 3;
            return (
              <Box
                key={c}
                style={{
                  minHeight: 44,
                  padding: 2,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  borderLeft: c > 0 ? WEEK_GRID_BORDER : undefined,
                }}
              >
                {Array.from({ length: blocks }).map((_, b) => (
                  <Skeleton key={b} height={18} radius={3} style={{ width: "100%" }} />
                ))}
              </Box>
            );
          })}
        </Box>
      ))}
    </Paper>
  );
}

/**
 * Stacked resource rows matching the Week (H) view shape (label + 7-day lane).
 * No weekday header inside: the real Week (H) view replaces Mantine's internal
 * day-labels row with the pinned `WeekDayLabelStrip`, which stays visible
 * above this skeleton while it loads.
 */
export function WeekGridSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Paper withBorder radius="md" p="sm">
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

/**
 * Dual Pane skeleton: the Month grid skeleton and the Agenda list skeleton in
 * the view's own responsive layout — side by side at `lg` (Month at the
 * persisted split ratio, Agenda filling the rest). Below `lg` the Agenda pane
 * is hidden (the view is the standalone Month view), so only the month column
 * renders. Mirrors the real `DualPaneView` shapes so the swap on load is
 * seamless; the sr-only LoadingStatus is rendered by the caller, as with the
 * other view skeletons.
 */
export function DualPaneSkeleton({
  rows,
  splitPct,
  chromeOffset,
}: {
  rows: number;
  splitPct: number;
  /** Measured chrome height — mirrors the real view's viewport-bounded height. */
  chromeOffset: number;
}) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const scrollBody = {
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto" as const,
    overflowX: "hidden" as const,
  };
  return (
    <Box
      style={{
        display: "flex",
        flexDirection: isDesktop ? "row" : "column",
        alignItems: isDesktop ? "stretch" : "flex-start",
        gap: isDesktop ? 0 : "var(--mantine-spacing-md)",
        ...(isDesktop
          ? {
              height: `calc(var(--app-shell-vh, 100dvh) - var(--app-shell-header-offset) - var(--app-shell-footer-offset) - var(--app-shell-padding) - var(--mantine-spacing-xl) - var(--mantine-spacing-sm) - ${chromeOffset}px)`,
              overflow: "hidden",
            }
          : null),
      }}
    >
      <Box
        style={{
          flex: isDesktop ? `0 0 ${splitPct * 100}%` : undefined,
          width: isDesktop ? undefined : "100%",
          minWidth: 0,
          display: isDesktop ? "flex" : undefined,
          flexDirection: isDesktop ? "column" : undefined,
          minHeight: isDesktop ? 0 : undefined,
        }}
      >
        <Box style={isDesktop ? scrollBody : undefined}>
          <MonthGridSkeleton rows={rows} />
        </Box>
      </Box>
      {/* The agenda column is desktop only — below `lg` the view (and its
          loading shape) is the standalone Month view. */}
      {isDesktop && (
        <Box
          style={{
            flex: "1 1 0",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <Box style={scrollBody}>
            <AgendaListSkeleton />
          </Box>
        </Box>
      )}
    </Box>
  );
}

const MATRIX_BORDER = "1px solid var(--mantine-color-default-border)";
/** Week (D) lane height — mirrors `ROW_HEIGHT_PX` in `WeekMatrixView`. */
const MATRIX_ROW_HEIGHT_PX = 36;

/**
 * Matrix matching the Week (D) shape (`WeekMatrixView`): a two-line-per-day
 * header band inside the bordered paper, then one row per resource — sticky
 * label placeholder + a 7-column day grid whose spanning banner bars cross
 * multiple day cells. Deterministic bar placement only (SSR-safe).
 */
export function WeekMatrixSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Paper withBorder radius="md" p={0} style={{ overflow: "hidden" }}>
      {/* Day-header band: two stacked bars per column (weekday + date). */}
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          borderBottom: MATRIX_BORDER,
        }}
      >
        {Array.from({ length: 7 }).map((_, c) => (
          <Box
            key={c}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "5px 2px",
            }}
          >
            <Skeleton height={10} radius={2} style={{ width: "55%" }} />
            <Skeleton height={8} radius={2} style={{ width: "25%" }} />
          </Box>
        ))}
      </Box>

      {/* Resource rows: label column + day grid with spanning banners. */}
      {Array.from({ length: rows }).map((_, i) => {
        // One deterministic multi-day banner per row, varying start/span.
        const startDay = (i * 2 + 1) % 5;
        const spanDays = 2 + ((i + 1) % 2);
        const rowBorder = i < rows - 1 ? MATRIX_BORDER : undefined;
        return (
          <Box key={i} style={{ display: "flex" }}>
            <Box
              style={{
                flexShrink: 0,
                width: 48,
                borderRight: MATRIX_BORDER,
                borderBottom: rowBorder,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Skeleton height={10} radius={2} style={{ width: "60%" }} />
            </Box>
            <Box
              style={{
                flex: 1,
                minWidth: 0,
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                borderBottom: rowBorder,
              }}
            >
              {Array.from({ length: 7 }).map((_, c) => (
                <Box
                  key={c}
                  style={{
                    gridColumn: `${1 + c} / ${2 + c}`,
                    gridRow: 1,
                    height: MATRIX_ROW_HEIGHT_PX,
                    borderLeft: c > 0 ? MATRIX_BORDER : undefined,
                  }}
                />
              ))}
              <Box
                style={{
                  gridColumn: `${1 + startDay} / ${1 + startDay + spanDays}`,
                  gridRow: 1,
                  zIndex: 1,
                  padding: 2,
                }}
              >
                <Skeleton height={28} radius={8} style={{ width: "100%" }} />
              </Box>
            </Box>
          </Box>
        );
      })}
    </Paper>
  );
}
