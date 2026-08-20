"use client";

/**
 * Week v2 matrix: 7 day columns (Monday-first) x one row per user/department.
 * No Mantine Schedule component fits this shape (WeekView has no user axis;
 * ResourcesWeekView's columns are hourly time lanes; ResourcesMonthView always
 * spans a whole month), so the grid is plain CSS. Each department group is its
 * own grid block (the group label spans the group's rows) and every block
 * shares one column template, so the day columns line up. Cells show up to two
 * event-title chips (Mantine "light" variant colors, like the schedule views);
 * the rest of the cell starts a new event on that day.
 */

import dayjs from "dayjs";
import { type MouseEvent, type ReactNode, useMemo } from "react";
import { Box, Paper, ScrollArea, Text, UnstyledButton, useMantineTheme } from "@mantine/core";

import { buildWeekMatrix } from "@/lib/events/weekMatrix";
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
  /** Tapping "+N more": browse every event of that row on that day. */
  onOverflowClick: (
    day: string,
    resource: ScheduleResource,
    cellEvents: CalendarEvent[],
    e: MouseEvent<HTMLButtonElement>,
  ) => void;
}

/** Chips shown per cell before the "+N more" overflow chip takes over. */
const MAX_VISIBLE_EVENTS = 2;
/** Minimum row height, close to the other schedule views' compact rows. */
const ROW_HEIGHT_PX = 44;
const LABEL_WIDTH = "3rem";
const GROUP_WIDTH = "1.5rem";
const CELL_BORDER = "1px solid var(--mantine-color-default-border)";

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
  onOverflowClick,
}: WeekMatrixViewProps) {
  const theme = useMantineTheme();
  const hasGroups = groups !== undefined;
  // One template for the header and every block: [group col] + label col +
  // seven equal day columns that shrink (minmax 0) instead of overflowing,
  // so the grid always fits the phone width with no horizontal scroll.
  const template = `${hasGroups ? `${GROUP_WIDTH} ` : ""}${LABEL_WIDTH} repeat(7, minmax(0, 1fr))`;
  const todayTint = theme.variantColorResolver({
    color: theme.primaryColor,
    theme,
    variant: "light",
  }).background;

  const matrix = useMemo(() => buildWeekMatrix(events, days), [events, days]);

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
    <Paper withBorder radius="md" p={0} style={{ overflow: "hidden" }}>
      <ScrollArea type="auto" style={{ height: "min(60vh, 520px)" }}>
        <Box component="div" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Sticky day header: with all seven columns visible at once, no
              pinned single-day strip is needed (unlike the timeline view). */}
          <Box
            component="div"
            role="row"
            style={{
              position: "sticky",
              top: 0,
              zIndex: 10,
              display: "grid",
              gridTemplateColumns: template,
              background: "var(--mantine-color-body)",
              borderBottom: CELL_BORDER,
            }}
          >
            <Box
              component="div"
              aria-hidden
              style={{ gridColumn: hasGroups ? "span 2" : "span 1", borderRight: CELL_BORDER }}
            />
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

          {blocks.map((block, blockIndex) => (
            <Box
              component="div"
              key={block.key}
              role="rowgroup"
              style={{
                display: "grid",
                gridTemplateColumns: template,
                gridAutoRows: `minmax(${ROW_HEIGHT_PX}px, auto)`,
                borderTop: blockIndex > 0 ? CELL_BORDER : undefined,
              }}
            >
              {block.label !== null ? (
                <Box
                  component="div"
                  role="rowheader"
                  style={{
                    gridColumn: 1,
                    gridRow: `span ${block.rows.length}`,
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
                // Empty spacer keeps the label cell in the second column when
                // a block has no group label but a group column is present.
                <Box
                  component="div"
                  aria-hidden
                  style={{ gridColumn: 1, gridRow: `span ${block.rows.length}` }}
                />
              ) : null}
              {block.rows.map((resource, rowIndex) => (
                <MatrixRow
                  key={resource.id}
                  resource={resource}
                  cellEvents={days.map((day) => matrix.get(resource.id)?.get(day) ?? [])}
                  days={days}
                  today={today}
                  todayTint={todayTint}
                  lastRow={rowIndex === block.rows.length - 1}
                  renderResourceLabel={renderResourceLabel}
                  onEventClick={onEventClick}
                  onCellClick={onCellClick}
                  onOverflowClick={onOverflowClick}
                />
              ))}
            </Box>
          ))}
        </Box>
      </ScrollArea>
    </Paper>
  );
}

/**
 * One resource row: the left label cell plus seven day cells. Rendered as
 * plain (non-grid) children of the block's grid so the block's auto-placement
 * lines them up under the shared column template.
 */
function MatrixRow({
  resource,
  cellEvents,
  days,
  today,
  todayTint,
  lastRow,
  renderResourceLabel,
  onEventClick,
  onCellClick,
  onOverflowClick,
}: {
  resource: ScheduleResource;
  cellEvents: CalendarEvent[][];
  days: string[];
  today: string;
  todayTint: string;
  /** Last row of its block: no bottom border (the Paper / next block borders). */
  lastRow: boolean;
  renderResourceLabel: (resource: ScheduleResource) => ReactNode;
  onEventClick: (event: CalendarEvent, e: MouseEvent<HTMLButtonElement>) => void;
  onCellClick: (day: string, e: MouseEvent<HTMLDivElement>) => void;
  onOverflowClick: (
    day: string,
    resource: ScheduleResource,
    cellEvents: CalendarEvent[],
    e: MouseEvent<HTMLButtonElement>,
  ) => void;
}) {
  const theme = useMantineTheme();
  const rowBorder = lastRow ? undefined : CELL_BORDER;
  return (
    <>
      <Box
        component="div"
        role="rowheader"
        style={{
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
      {days.map((day, index) => {
        const eventsInCell = cellEvents[index] ?? [];
        const isToday = day === today;
        return (
          <Box
            component="div"
            key={day}
            role="gridcell"
            aria-label={dayjs(day).format("dddd, MMMM D")}
            onClick={(e) => onCellClick(day, e)}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              padding: 2,
              borderLeft: index > 0 ? CELL_BORDER : undefined,
              borderBottom: rowBorder,
              background: isToday ? todayTint : "transparent",
            }}
          >
            {eventsInCell.slice(0, MAX_VISIBLE_EVENTS).map((event) => {
              const colors = theme.variantColorResolver({
                color: event.color,
                theme,
                variant: "light",
              });
              return (
                <UnstyledButton
                  key={event.id}
                  aria-label={event.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick(event, e);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "1px 4px",
                    borderRadius: 3,
                    border: `1px solid ${colors.border}`,
                    background: colors.background,
                    color: colors.color,
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontSize: "0.75rem",
                    lineHeight: 1.4,
                  }}
                >
                  {event.title}
                </UnstyledButton>
              );
            })}
            {eventsInCell.length > MAX_VISIBLE_EVENTS && (
              <UnstyledButton
                onClick={(e) => {
                  e.stopPropagation();
                  onOverflowClick(day, resource, eventsInCell, e);
                }}
                style={{
                  alignSelf: "flex-start",
                  padding: 0,
                  fontSize: "0.75rem",
                  lineHeight: 1.2,
                }}
              >
                <Text size="xs" c="dimmed" fw={500}>
                  +{eventsInCell.length - MAX_VISIBLE_EVENTS} more
                </Text>
              </UnstyledButton>
            )}
          </Box>
        );
      })}
    </>
  );
}
