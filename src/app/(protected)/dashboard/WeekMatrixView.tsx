"use client";

/**
 * Week (D) matrix: 7 day columns (ordered by the account's week start) x one row per user/department.
 * Multi-day events render as spanning banners that occupy every day they
 * cover within a row, placed in lanes (stacked vertically) so overlapping
 * events don't collide.  The day header and the left group/user labels are
 * pinned while the table scrolls horizontally, mirroring the Day/Week (H)
 * schedule views: each department block is a flex row whose group label is
 * sticky-left, and each resource row is a flex row whose label is sticky-left
 * beside a shared day grid, so every day column lines up across the table.
 */

import dayjs from "dayjs";
import {
  useCallback,
  useLayoutEffect,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useMemo,
  useRef,
} from "react";
import { Box, Paper, ScrollArea, Text, UnstyledButton, useMantineTheme } from "@mantine/core";
import { useMediaQuery, useMergedRef } from "@mantine/hooks";

import { GridNavControls } from "@/components/GridNavControls";
import { buildWeekLanes } from "@/lib/events/weekMatrix";
import type { WeekSpan } from "@/lib/events/weekMatrix";
import type { CalendarEvent } from "@/lib/events/queries";
import type { ScheduleResource, ScheduleResourceGroup } from "@/lib/events/schedule";
import { announce } from "@/lib/ui/announcer";
import { useGridPan } from "@/lib/ui/gridPan";
import { usePinchZoom } from "@/lib/ui/pinchZoom";
import { animateZoom, scrollAnchorTracker } from "@/lib/ui/zoomAnim";
import {
  clampGridWeekColZoom,
  MIN_COLUMN_ZOOM,
  WEEK_MATRIX_DAY_MIN_PX,
  type SlotZoom,
} from "@/lib/ui/slotZoom";

export interface WeekMatrixViewProps {
  /** The seven days of the displayed week, in week-start order (`YYYY-MM-DD`). */
  days: string[];
  /** Rows in display order: department row + its users, per department. */
  resources: ScheduleResource[];
  /** Department group column; present only when more than one department. */
  groups: ScheduleResourceGroup[] | undefined;
  /** The week's events (already calendar/type/user filtered). */
  events: CalendarEvent[];
  /**
   * Department id → active member user ids. Department-tagged events expand to
   * each member's row (so members see them in their own cell), in addition to
   * the department row.
   */
  memberships?: ReadonlyMap<string, string[]>;
  /** Today (`YYYY-MM-DD`) for the highlighted day column. */
  today: string;
  /**
   * The current user's id: that user's row is tinted (the "my entries"
   * highlight — matches the row tint of the Day/Week (H) views). A no-match
   * id (e.g. an admin without a roster row) simply tints nothing.
   */
  myRowId: string;
  renderResourceLabel: (resource: ScheduleResource) => ReactNode;
  onEventClick: (event: CalendarEvent, e: MouseEvent<HTMLButtonElement>) => void;
  /** Tapping an empty part of a cell: start a new event on that day. */
  onCellClick: (day: string, e: MouseEvent<HTMLDivElement>) => void;
  /**
   * Current Week (D) day-column zoom level. Single horizontal axis over the
   * matrix's absolute px column floor (1 = the default readable width; the
   * floor is also the zoom-out limit). Owned/persisted by the parent.
   */
  zoom: SlotZoom;
  /** Step the day-column zoom one notch (the parent persists the level). */
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Commit an arbitrary zoom level (pinch-to-zoom). */
  onZoomChange: (next: SlotZoom) => void;
  /**
   * Height of the sticky chrome block above the grid (view tabs + date-nav
   * row). The pinned day header sits just below it
   * (`top: calc(var(--app-shell-header-offset) + chromeOffset)`).
   */
  chromeOffset: number;
  /**
   * Anchor for the floating zoom/pan controls. The matrix bleeds with the
   * calendar canvas when zoomed in, so the parent passes its padded canvas box
   * here to keep the controls fixed; defaults to the matrix root.
   */
  controlsAnchorRef?: RefObject<HTMLDivElement | null>;
}

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
  memberships,
  today,
  myRowId,
  renderResourceLabel,
  onEventClick,
  onCellClick,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomChange,
  chromeOffset,
  controlsAnchorRef,
}: WeekMatrixViewProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  // Drag-to-pan + edge pan buttons + pinch-to-zoom (same story as the Day/Week
  // (H) schedule views — see useGridPan / usePinchZoom). `pan-x pan-y` keeps
  // native panning but stops the browser page-pinching over the grid, so the
  // pinch handler below owns the two-finger gesture. Always enabled, not
  // desktop-gated.
  const gridPan = useGridPan({ touchAction: "pan-x pan-y" });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const labelWidth = isDesktop ? DESKTOP_LABEL_WIDTH : MOBILE_LABEL_WIDTH;
  const groupWidth = isDesktop ? DESKTOP_GROUP_WIDTH : MOBILE_GROUP_WIDTH;
  const hasGroups = groups !== undefined;
  // Zoom-derived day-column geometry: the min column width scales with the
  // shared `--c2-zoom` / `--c2-zoom-anim` (floored at the fit default), so the
  // seven columns widen and overflow into the horizontal pan. The same
  // expression drives the pinned header and the scroll-content min-width,
  // keeping the columns aligned while they overflow and animating with the
  // scroll re-anchor (`animateZoom`).
  const dayMin = `calc(${WEEK_MATRIX_DAY_MIN_PX}px * max(1, var(--c2-zoom-anim, var(--c2-zoom))))`;
  const dayTemplate = `repeat(7, minmax(${dayMin}, 1fr))`;
  const dayMinWidth = `calc(7 * ${WEEK_MATRIX_DAY_MIN_PX}px * max(1, var(--c2-zoom-anim, var(--c2-zoom))))`;
  // ScrollArea content min-width: guarantees horizontal scroll on narrow
  // screens so the day columns never shrink below their zoomed floor.
  const contentMinWidth = `calc(${hasGroups ? `${groupWidth} + ` : ""}${labelWidth} + 7 * ${WEEK_MATRIX_DAY_MIN_PX}px * max(1, var(--c2-zoom-anim, var(--c2-zoom))))`;
  // The pinned day header sticks below the sticky tabs+date-nav chrome.
  const headerTop = `calc(var(--app-shell-header-offset) + ${chromeOffset}px)`;
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

  // Pinch-to-zoom (touch): the same discrete level set as the buttons (the
  // clamp snaps), with the gesture midpoint stashed for the re-anchor below so
  // the day under the fingers stays put (buttons re-anchor on the centre).
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pinchBaseRef = useRef<SlotZoom>(zoom);
  const pinchFocalRef = useRef<number | undefined>(undefined);
  const pinch = usePinchZoom({
    onStart: () => {
      pinchBaseRef.current = zoom;
    },
    onPinch: ({ scale, focalX }) => {
      const next = clampGridWeekColZoom(pinchBaseRef.current * scale);
      if (next === null || next === zoom) return;
      pinchFocalRef.current = focalX;
      onZoomChange(next);
    },
    onEnd: () => announce(`Zoom ${Math.round(zoom * 100)}%`),
  });
  const mergedViewportRef = useMergedRef(viewportRef, gridPan.viewportRef, pinch.ref);

  // The sticky group/label columns are zoom-invariant, so the re-anchor must
  // subtract that fixed left offset from the day timeline before scaling. Their
  // widths are measured from the pinned header's spacers, which share them.
  const groupMeasureRef = useRef<HTMLDivElement | null>(null);
  const labelMeasureRef = useRef<HTMLDivElement | null>(null);

  // Zoom re-anchor: widening the day columns would otherwise keep the same
  // scrollLeft, so the day under the viewport's center drifts. Keep it centered,
  // scaling by the zoom ratio and accounting for the fixed label column (mirrors
  // the Week (Grid) column re-anchor). Only on a genuine zoom change — never on
  // mount or view switches. The content width changes too, which the pan hook's
  // ResizeObserver (watching the viewport box) can't see, so refresh the edge
  // flags so the pan arrows appear/disappear with the zoom.
  const prevZoomRef = useRef(zoom);
  const { remeasure: remeasureGridPan } = gridPan;
  useLayoutEffect(() => {
    const zoomChanged = prevZoomRef.current !== zoom;
    const oldZoom = prevZoomRef.current;
    prevZoomRef.current = zoom;
    if (!zoomChanged) {
      return;
    }
    const viewport = viewportRef.current;
    const owner = rootRef.current;
    if (viewport && owner && viewport.clientWidth > 0) {
      const labelPx =
        (groupMeasureRef.current?.getBoundingClientRect().width ?? 0) +
        (labelMeasureRef.current?.getBoundingClientRect().width ?? 0);
      const focalX = pinchFocalRef.current;
      pinchFocalRef.current = undefined;
      const tracker = scrollAnchorTracker(viewport, { label: labelPx, focal: focalX });
      animateZoom(owner, {
        from: oldZoom,
        to: zoom,
        apply: (z) => owner.style.setProperty("--c2-zoom-anim", String(z)),
        onStart: tracker.capture,
        onScroll: () => tracker.apply(),
        onDone: () => owner.style.removeProperty("--c2-zoom-anim"),
      });
    }
    remeasureGridPan();
  }, [zoom, remeasureGridPan]);

  const laneMap = useMemo(
    () => buildWeekLanes(events, days, memberships),
    [events, days, memberships],
  );

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
    <>
      <Paper
        ref={rootRef}
        withBorder
        radius="md"
        p={0}
        // The day-column geometry derives from this multiplier (and the local
        // `--c2-zoom-anim` during a zoom animation); see `dayMin` above.
        style={{ "--c2-zoom": zoom } as CSSProperties}
      >
        {/* Pinned day header: sticks to the viewport below the tabs+date-nav
          chrome while the (full-height) table scrolls with the page. The
          corner spacers stay put; only the day columns translate
          (-scrollLeft) to track the table's horizontal scroll, clipped to the
          table's width. */}
        <Box
          component="div"
          className="c2-glass-surface"
          style={{
            position: "sticky",
            top: headerTop,
            zIndex: 10,
            overflow: "hidden",
            borderBottom: CELL_BORDER,
          }}
        >
          <Box component="div" style={{ display: "flex", minWidth: 0 }}>
            {hasGroups && (
              <Box
                ref={groupMeasureRef}
                component="div"
                aria-hidden
                style={{ flexShrink: 0, width: groupWidth, borderRight: CELL_BORDER }}
              />
            )}
            <Box
              ref={labelMeasureRef}
              component="div"
              aria-hidden
              style={{ flexShrink: 0, width: labelWidth, borderRight: CELL_BORDER }}
            />
            <Box component="div" style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <Box
                ref={headerInnerRef}
                component="div"
                className="c2-zoom-track"
                role="row"
                style={{
                  display: "grid",
                  gridTemplateColumns: dayTemplate,
                  width: "100%",
                  minWidth: dayMinWidth,
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
          horizontal scroll stays internal (min-width day columns). The
          viewport gets the desktop pan handlers + ref (see useGridPan above). */}
        <ScrollArea
          type="auto"
          styles={{ content: { minWidth: contentMinWidth } }}
          viewportRef={mergedViewportRef}
          viewportProps={gridPan.viewportProps}
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
                      isMineRow={resource.id === myRowId}
                      lastRow={rowIndex === block.rows.length - 1}
                      renderResourceLabel={renderResourceLabel}
                      onEventClick={onEventClick}
                      onCellClick={onCellClick}
                      labelLeft={labelLeft}
                      labelWidth={labelWidth}
                      dayTemplate={dayTemplate}
                      dayMinWidth={dayMinWidth}
                    />
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        </ScrollArea>
      </Paper>

      {/* Day-column zoom + edge pan controls (the same right-edge cluster the
          other grids use): the zoom pair always shows; the pan arrows appear
          only once a zoom level overflows the viewport. */}
      <GridNavControls
        anchorRef={controlsAnchorRef ?? rootRef}
        layoutKey={isDesktop}
        canScrollLeft={gridPan.canScrollLeft}
        canScrollRight={gridPan.canScrollRight}
        onPan={gridPan.panTo}
        zoom={zoom}
        zoomMin={MIN_COLUMN_ZOOM}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
      />
    </>
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
  isMineRow,
  lastRow,
  renderResourceLabel,
  onEventClick,
  onCellClick,
  labelLeft,
  labelWidth,
  dayTemplate,
  dayMinWidth,
}: {
  resource: ScheduleResource;
  /** Lanes in draw order.  Lane i renders on grid row i + 1. */
  spans: WeekSpan[][];
  days: string[];
  today: string;
  todayTint: string;
  /** The current user's row (see the `myRowId` prop). */
  isMineRow: boolean;
  /** Last row of its block: no bottom border. */
  lastRow: boolean;
  renderResourceLabel: (resource: ScheduleResource) => ReactNode;
  onEventClick: (event: CalendarEvent, e: MouseEvent<HTMLButtonElement>) => void;
  onCellClick: (day: string, e: MouseEvent<HTMLDivElement>) => void;
  /** Sticky-left offset for the label (the group column width when groups exist). */
  labelLeft: string;
  /** Width of the sticky resource-label column. */
  labelWidth: string;
  /** Seven-column day template at the current zoom (matches the pinned header). */
  dayTemplate: string;
  /** Day-area min width at the current zoom (the horizontal scroll floor). */
  dayMinWidth: string;
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
          // Inline (so it wins over the row's CSS background); the accent-6
          // inset bar for the mine row comes from the shared :has() rule.
          background: isMineRow ? "var(--c2-my-label-tint)" : "var(--mantine-color-body)",
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
          minWidth: dayMinWidth,
          display: "grid",
          gridTemplateColumns: dayTemplate,
          gridAutoRows: `minmax(${ROW_HEIGHT_PX}px, auto)`,
        }}
      >
        {/* Day background cells — span all lanes, tinted for the mine row
            (uniform amber, wins over today) else for today, clickable. */}
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
                // --c2-my-row-tint is uniform across the week (it wins over
                // the today tint so the row reads as one block) and switches
                // to the darker olive in dark mode.
                background: isMineRow
                  ? "var(--c2-my-row-tint)"
                  : isToday
                    ? todayTint
                    : "transparent",
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
                  // External events carry the purple ring (self-outline: the
                  // banner box is the chip itself, unlike the ScheduleEvent
                  // roots where the ring targets the inner child).
                  className={span.event.payload.external === true ? "c2-ext-ring" : undefined}
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
