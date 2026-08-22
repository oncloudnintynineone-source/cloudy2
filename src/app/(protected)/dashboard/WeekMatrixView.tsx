"use client";

/**
 * Week v2 matrix: 7 day columns (Monday-first) x one row per user/department.
 * Multi-day events render as spanning banners that occupy every day they
 * cover within a row, placed in lanes (stacked vertically) so overlapping
 * events don't collide.  The day header and the left group/user labels are
 * pinned while the table scrolls horizontally, mirroring the Day/Week
 * schedule views: each department block is a flex row whose group label is
 * sticky-left, and each resource row is a flex row whose label is sticky-left
 * beside a shared day grid, so every day column lines up across the table.
 */

import dayjs from "dayjs";
import { useCallback, type MouseEvent, type ReactNode, useMemo, useRef } from "react";
import { Box, Paper, ScrollArea, Text, UnstyledButton, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

import { buildWeekLanes } from "@/lib/events/weekMatrix";
import type { WeekSpan } from "@/lib/events/weekMatrix";
import type { CalendarEvent } from "@/lib/events/queries";
import type { ScheduleResource, ScheduleResourceGroup } from "@/lib/events/schedule";

export interface WeekMatrixViewProps {
  /** The seven days of the displayed week, Monday-first (`YYYY-MM-DD`). */
  days: string[];
  /** Rows in display order: department row + its users, per department. */
  resources: ScheduleResource[];
  /** Department group column; present only when more than one department. */
  groups: ScheduleResourceGroup[] | undefined;
  /** The week's events (already calendar/type/user filtered). */
  events: CalendarEvent[];
  /** Today (`YYYY-MM-DD`) for the highlighted day column. */
  today: string;
  renderResourceLabel: (resource: ScheduleResource) => ReactNode;
  onEventClick: (event: CalendarEvent, e: MouseEvent<HTMLButtonElement>) => void;
  /** Tapping an empty part of a cell: start a new event on that day. */
  onCellClick: (day: string, e: MouseEvent<HTMLDivElement>) => void;
  /**
   * Height of the sticky view-tabs bar (px). The pinned day header sits just
   * below it (`top: calc(var(--app-shell-header-offset) + tabBarOffset)`).
   */
  tabBarOffset: number;
}

/** Minimum day-column width in pixels so event titles are readable. */
const MIN_DAY_PX = 112;
/**
 * Compact lane height: matches the schedule views' all-day bar height
 * (~1.25rem / 20px) with a little extra for the banner border and padding.
 * Kept small so several same-day events stack without towering over the
 * other rows.
 */
const ROW_HEIGHT_PX = 36;
// Mobile-narrowed sticky label columns; desktop widens them so user
// shortnames and department names are readable (see the component below).
const MOBILE_LABEL_WIDTH = "3rem";
const MOBILE_GROUP_WIDTH = "1.5rem";
const DESKTOP_LABEL_WIDTH = "5rem";
const DESKTOP_GROUP_WIDTH = "2.5rem";
const CELL_BORDER = "1px solid var(--mantine-color-default-border)";
/** Seven day columns sharing one template; each stays ≥ MIN_DAY_PX wide. */
const DAY_TEMPLATE = `repeat(7, minmax(${MIN_DAY_PX}px, 1fr))`;
/** Total day-area width (7 × MIN_DAY_PX) — the floor before horizontal scroll. */
const DAY_MIN_WIDTH = `${7 * MIN_DAY_PX}px`;

interface MatrixBlock {
  key: string;
  /** Group (department) label for the spanning column, or null. */
  label: string | null;
  rows: ScheduleResource[];
}

export function WeekMatrixView({
  days,
  resources,
  groups,
  events,
  today,
  renderResourceLabel,
  onEventClick,
  onCellClick,
  tabBarOffset,
}: WeekMatrixViewProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const labelWidth = isDesktop ? DESKTOP_LABEL_WIDTH : MOBILE_LABEL_WIDTH;
  const groupWidth = isDesktop ? DESKTOP_GROUP_WIDTH : MOBILE_GROUP_WIDTH;
  const hasGroups = groups !== undefined;
  // ScrollArea content min-width: guarantees horizontal scroll on narrow
  // screens so the day columns never shrink below MIN_DAY_PX.
  const contentMinWidth = `calc(${hasGroups ? `${groupWidth} + ` : ""}${labelWidth} + 7 * ${MIN_DAY_PX}px)`;
  // The pinned day header sticks below the sticky view-tabs bar.
  const headerTop = `calc(var(--app-shell-header-offset) + ${tabBarOffset}px)`;
  // The resource label pins just right of the group column while scrolling.
  const labelLeft = hasGroups ? groupWidth : "0";
  const todayTint = theme.variantColorResolver({
    color: theme.primaryColor,
    theme,
    variant: "light",
  }).background;

  // The pinned header sits outside the (horizontal) scroll area, so its day
  // columns follow the table via a transform updated directly on scroll —
  // no React re-render per frame.
  const headerInnerRef = useRef<HTMLDivElement>(null);
  const handleScroll = useCallback((pos: { x: number }) => {
    if (headerInnerRef.current) {
      headerInnerRef.current.style.transform = `translateX(${-pos.x}px)`;
    }
  }, []);

  const laneMap = useMemo(() => buildWeekLanes(events, days), [events, days]);

  // One block per department group (the group label spans the group's rows);
  // resources not covered by any group still get rows (defensive).
  const blocks = useMemo<MatrixBlock[]>(() => {
    if (!groups) {
      return resources.map((resource) => ({ key: resource.id, label: null, rows: [resource] }));
    }
    const blocks: MatrixBlock[] = [];
    const consumed = new Set<string>();
    for (const group of groups) {
      const rows = group.resourceIds
        .map((id) => resources.find((resource) => resource.id === id))
        .filter((resource): resource is ScheduleResource => resource !== undefined);
      rows.forEach((row) => consumed.add(row.id));
      blocks.push({ key: group.label, label: group.label, rows });
    }
    for (const resource of resources) {
      if (!consumed.has(resource.id)) {
        blocks.push({ key: resource.id, label: null, rows: [resource] });
      }
    }
    return blocks;
  }, [resources, groups]);

  return (
    <Paper withBorder radius="md" p={0}>
      {/* Pinned day header: sticks to the viewport below the view tabs while
          the (full-height) table scrolls with the page. The corner spacers
          stay put; only the day columns translate (-scrollLeft) to track the
          table's horizontal scroll, clipped to the table's width. */}
      <Box
        component="div"
        style={{
          position: "sticky",
          top: headerTop,
          zIndex: 10,
          overflow: "hidden",
          background: "var(--mantine-color-body)",
          borderBottom: CELL_BORDER,
        }}
      >
        <Box component="div" style={{ display: "flex", minWidth: 0 }}>
          {hasGroups && (
            <Box
              component="div"
              aria-hidden
              style={{ flexShrink: 0, width: groupWidth, borderRight: CELL_BORDER }}
            />
          )}
          <Box
            component="div"
            aria-hidden
            style={{ flexShrink: 0, width: labelWidth, borderRight: CELL_BORDER }}
          />
          <Box component="div" style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            <Box
              ref={headerInnerRef}
              component="div"
              role="row"
              style={{
                display: "grid",
                gridTemplateColumns: DAY_TEMPLATE,
                width: "100%",
                minWidth: DAY_MIN_WIDTH,
                willChange: "transform",
              }}
            >
              {days.map((day) => {
                const dayObj = dayjs(day);
                const isToday = day === today;
                const isWeekend = dayObj.day() === 0 || dayObj.day() === 6;
                const labelColor = isToday
                  ? "var(--mantine-primary-color-contrast)"
                  : isWeekend
                    ? "var(--mantine-color-red-6)"
                    : undefined;
                return (
                  <Box
                    component="div"
                    key={day}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      padding: "4px 2px",
                      userSelect: "none",
                      background: isToday ? "var(--mantine-primary-color-filled)" : "transparent",
                      color: labelColor,
                    }}
                  >
                    <Text
                      size="sm"
                      fw={isToday ? "bold" : "medium"}
                      style={{ lineHeight: 1.1, textTransform: "capitalize" }}
                    >
                      {dayObj.format("ddd")}
                    </Text>
                    <Text size="xs" style={{ lineHeight: 1.1 }}>
                      {dayObj.format("D")}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Full-height table: no vertical clamp, so the page scrolls; only the
          horizontal scroll stays internal (min-width day columns). */}
      <ScrollArea
        type="auto"
        styles={{ content: { minWidth: contentMinWidth } }}
        onScrollPositionChange={handleScroll}
      >
        <Box component="div" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          {blocks.map((block, blockIndex) => (
            <Box
              component="div"
              key={block.key}
              role="rowgroup"
              style={{
                display: "flex",
                borderTop: blockIndex > 0 ? CELL_BORDER : undefined,
              }}
            >
              {block.label !== null ? (
                <Box
                  component="div"
                  role="rowheader"
                  style={{
                    position: "sticky",
                    left: 0,
                    flexShrink: 0,
                    width: groupWidth,
                    zIndex: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRight: CELL_BORDER,
                    background: "var(--mantine-color-body)",
                  }}
                >
                  <Text
                    size="xs"
                    c="dimmed"
                    style={{ writingMode: "vertical-rl", userSelect: "none" }}
                  >
                    {block.label}
                  </Text>
                </Box>
              ) : hasGroups ? (
                <Box component="div" aria-hidden style={{ flexShrink: 0, width: groupWidth }} />
              ) : null}
              <Box component="div" style={{ flex: 1, minWidth: 0 }}>
                {block.rows.map((resource, rowIndex) => (
                  <MatrixRow
                    key={resource.id}
                    resource={resource}
                    spans={laneMap.get(resource.id) ?? []}
                    days={days}
                    today={today}
                    todayTint={todayTint}
                    lastRow={rowIndex === block.rows.length - 1}
                    renderResourceLabel={renderResourceLabel}
                    onEventClick={onEventClick}
                    onCellClick={onCellClick}
                    labelLeft={labelLeft}
                    labelWidth={labelWidth}
                  />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      </ScrollArea>
    </Paper>
  );
}

/**
 * One resource row: a sticky-left label plus a day grid (seven day background
 * cells — clickable, tinted for today — and spanning event banners placed in
 * lanes). The label stays pinned while the row scrolls horizontally, like the
 * schedule views' resource labels.
 */
function MatrixRow({
  resource,
  spans,
  days,
  today,
  todayTint,
  lastRow,
  renderResourceLabel,
  onEventClick,
  onCellClick,
  labelLeft,
  labelWidth,
}: {
  resource: ScheduleResource;
  /** Lanes in draw order.  Lane i renders on grid row i + 1. */
  spans: WeekSpan[][];
  days: string[];
  today: string;
  todayTint: string;
  /** Last row of its block: no bottom border. */
  lastRow: boolean;
  renderResourceLabel: (resource: ScheduleResource) => ReactNode;
  onEventClick: (event: CalendarEvent, e: MouseEvent<HTMLButtonElement>) => void;
  onCellClick: (day: string, e: MouseEvent<HTMLDivElement>) => void;
  /** Sticky-left offset for the label (the group column width when groups exist). */
  labelLeft: string;
  /** Width of the sticky resource-label column. */
  labelWidth: string;
}) {
  const theme = useMantineTheme();
  const rowBorder = lastRow ? undefined : CELL_BORDER;
  // The label and day cells span all lane rows. Use a definite, positive span
  // (never `1 / -1`): the lanes are implicit rows created by the banners, and
  // a negative `-1` reference can resolve before those rows exist, leaving the
  // background/label covering only the first lane.
  const rowSpan = `1 / ${Math.max(1, spans.length) + 1}`;

  return (
    <Box component="div" role="row" style={{ display: "flex" }}>
      {/* Resource label — sticky left, spans all lanes. */}
      <Box
        component="div"
        role="rowheader"
        style={{
          position: "sticky",
          left: labelLeft,
          flexShrink: 0,
          width: labelWidth,
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRight: CELL_BORDER,
          borderBottom: rowBorder,
          background: "var(--mantine-color-body)",
          overflow: "hidden",
        }}
      >
        {renderResourceLabel(resource)}
      </Box>

      {/* Day grid — the horizontally scrolling part. */}
      <Box
        component="div"
        style={{
          flex: 1,
          minWidth: DAY_MIN_WIDTH,
          display: "grid",
          gridTemplateColumns: DAY_TEMPLATE,
          gridAutoRows: `minmax(${ROW_HEIGHT_PX}px, auto)`,
        }}
      >
        {/* Day background cells — span all lanes, tinted for today, clickable. */}
        {days.map((day, index) => {
          const isToday = day === today;
          return (
            <Box
              component="div"
              key={day}
              role="gridcell"
              aria-label={dayjs(day).format("dddd, MMMM D")}
              onClick={(e) => onCellClick(day, e)}
              style={{
                gridColumn: `${1 + index} / ${2 + index}`,
                gridRow: rowSpan,
                borderLeft: index > 0 ? CELL_BORDER : undefined,
                borderBottom: rowBorder,
                background: isToday ? todayTint : "transparent",
              }}
            />
          );
        })}

        {/* Spanning event banners — one per span, placed in lane rows. The
            outer button is a transparent spacer inset from the cell edge and
            the inner box is the visible chip (radius md = 8px, medium
            weight), so the banners read like the Mantine-based views with a
            roomier inset. */}
        {spans.map((lane, laneIndex) =>
          lane.map((span) => {
            const colors = theme.variantColorResolver({
              color: span.event.color,
              theme,
              variant: "light",
            });
            return (
              <UnstyledButton
                key={span.event.id}
                aria-label={span.event.title}
                onClick={(e) => {
                  e.stopPropagation();
                  onEventClick(span.event, e);
                }}
                style={{
                  gridColumn: `${1 + span.startDay} / ${2 + span.endDay}`,
                  gridRow: laneIndex + 1,
                  zIndex: 1,
                  padding: "2px",
                }}
              >
                <Box
                  component="span"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    height: "100%",
                    padding: "1px 6px",
                    borderRadius: 8,
                    border: `1px solid ${colors.border}`,
                    background: colors.background,
                    color: colors.color,
                    fontWeight: "var(--mantine-font-weight-medium)",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontSize: "0.75rem",
                    lineHeight: 1.4,
                  }}
                >
                  {span.event.title}
                </Box>
              </UnstyledButton>
            );
          }),
        )}
      </Box>
    </Box>
  );
}
