"use client";

/**
 * Dual Pane view: the Month grid and the Agenda list side by side.
 *
 * The view is **day-anchored** like the Day/Week/Agenda kinds: one shared
 * `?date=` anchor drives both panes. The Month pane shows the anchor's month
 * (the `month` prop the server derives from the date) and the Agenda pane shows
 * the anchor day's list, so the two always agree — moving the month (the nav
 * row's chevrons) moves the day, and stepping the day across a month edge moves
 * the grid.
 *
 * Layout: a row at `lg` and up — Month pane at the device-remembered split
 * fraction, a draggable handle, then the Agenda pane — and a plain stack below
 * `lg`. The split is a CSS custom property (`--c2-dual-split`) written straight
 * to the DOM during a drag, so resizing re-lays out both panes with no React
 * work per pointer frame; the committed value is persisted by the parent
 * (`onSplitCommit`).
 *
 * The Month pane keeps the standalone Month view's fit-to-width zoom
 * (`monthZoom`) and its own pan instance; the Agenda pane keeps the Agenda
 * tab's day header, swipe-to-change-day gesture and once-per-session hint.
 * Tapping a day cell in the grid selects that day in the Agenda pane.
 */

import dayjs from "dayjs";
import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActionIcon, Box, Portal, Text, useMantineTheme } from "@mantine/core";
import { useDrag, useMediaQuery, useMergedRef } from "@mantine/hooks";
import { AgendaView, MonthView } from "@mantine/schedule";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

import { GridNavControls } from "@/components/GridNavControls";
import {
  FULLSCREEN_BUTTON_SIZE,
  FULLSCREEN_EDGE_INSET,
} from "@/components/FullscreenToggle";
import { eventsOnDay } from "@/lib/events/agenda";
import type { CalendarEvent } from "@/lib/events/queries";
import { markAgendaSwipeHintSeen } from "@/lib/ui/agendaSwipeHint";
import {
  DUAL_SPLIT_DEFAULT,
  DUAL_SPLIT_MAX,
  DUAL_SPLIT_MIN,
  clampDualSplit,
  stepDualSplit,
} from "@/lib/ui/dualSplit";
import { useGridPan } from "@/lib/ui/gridPan";
import { MAX_MONTH_ZOOM, MIN_MONTH_ZOOM, type MonthZoom } from "@/lib/ui/monthZoom";
import { reanchorScrollLeft } from "@/lib/ui/slotZoom";
import { AgendaSwipeHint } from "./AgendaSwipeHint";
import { MonthWeekdayStrip } from "./MonthWeekdayStrip";

/**
 * Mantine's `RenderEvent` signature (the type is not re-exported from the
 * package root) — the Month/Agenda `renderEvent` prop contract. Structural
 * twin of DashboardView's `MyEventRender`, so the shared hooks pass through.
 */
export type DualPaneRenderEvent = (
  event: { id: string | number },
  props: ComponentPropsWithoutRef<"button"> & { children: ReactNode },
) => ReactElement;

export interface DualPaneViewProps {
  /** The Month pane's month (`YYYY-MM`; the agenda day's month). */
  month: string;
  /** The Agenda pane's day (`YYYY-MM-DD`), always inside `month`. */
  day: string;
  /** Month-pane events, pre-sorted so the user's claim the top rows. */
  monthEvents: CalendarEvent[];
  /** The full filtered event set (the Agenda pane bins the shown day). */
  events: CalendarEvent[];
  /** Month-pane fit-width zoom level + its step handlers. */
  monthZoom: MonthZoom;
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Committed Month-pane fraction (the device-remembered split). */
  splitPct: number;
  /** Persist a new split fraction (drag end, keyboard step, double-click reset). */
  onSplitCommit: (pct: number) => void;
  /** Month-pane event render hook (amber "mine" / purple "external" rings). */
  renderMonthEvent: DualPaneRenderEvent;
  /** Agenda-pane event render hook (amber/purple row treatment). */
  renderAgendaEvent: DualPaneRenderEvent;
  onEventClick: (event: CalendarEvent, e: MouseEvent<HTMLButtonElement>) => void;
  /** Select a day (grid tap, agenda chevrons or swipe) — the shared anchor. */
  onDaySelect: (day: string) => void;
  /** Show the touch-only swipe hint (coarse pointer, not yet seen this session). */
  showSwipeHint: boolean;
  /** Height of the sticky chrome block above the grid (tabs + date-nav row). */
  chromeOffset: number;
}

/** How far a horizontal drag must travel to count as a day swipe. */
const DAY_SWIPE_THRESHOLD = 48;
/** Hit zone width of the split handle (the visual bar is a thin child). */
const HANDLE_WIDTH = 16;
/** Month-pane right padding keeping the zoom/pan cluster clear of the handle. */
const HANDLE_GUTTER = 8;

/**
 * Dual Pane renderer. Mounted only for a `dual` tab; the parent owns the
 * period/zoom/split state and all navigation.
 */
export function DualPaneView({
  month,
  day,
  monthEvents,
  events,
  monthZoom,
  onZoomIn,
  onZoomOut,
  splitPct,
  onSplitCommit,
  renderMonthEvent,
  renderAgendaEvent,
  onEventClick,
  onDaySelect,
  showSwipeHint,
  chromeOffset,
}: DualPaneViewProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const monthBoxRef = useRef<HTMLDivElement | null>(null);

  // ---- Month pane: pan + zoomed scroll tracking (mirrors the Month tab) ----
  const monthPan = useGridPan();
  const monthViewportRef = useRef<HTMLDivElement | null>(null);
  const monthGridViewportRef = useMergedRef(monthViewportRef, monthPan.viewportRef);
  const weekdayTrackRef = useRef<HTMLDivElement | null>(null);
  const handleMonthScroll = useCallback((pos: { x: number }) => {
    if (weekdayTrackRef.current) {
      weekdayTrackRef.current.style.transform = `translateX(${-pos.x}px)`;
    }
  }, []);
  // Stable identity: the MonthView must not receive a fresh `scrollAreaProps`
  // object on every scroll frame.
  const monthScrollAreaProps = useMemo(
    () => ({
      viewportRef: monthGridViewportRef,
      onScrollPositionChange: handleMonthScroll,
      viewportProps: monthPan.viewportProps,
    }),
    [handleMonthScroll, monthGridViewportRef, monthPan.viewportProps],
  );
  // The zoom knob widens the ScrollArea content; every day column and event is
  // a percentage of it, so one width value re-lays out the whole grid.
  const monthViewInnerStyle = useMemo(
    () =>
      ({
        width: `${monthZoom * 100}%`,
        "--min-day-width": "0px",
      }) as CSSProperties,
    [monthZoom],
  );
  // Zoom re-anchor: keep the column under the viewport's center centered (no
  // label column — the scale ratio is just oldZoom → newZoom).
  const prevMonthZoomRef = useRef(monthZoom);
  useLayoutEffect(() => {
    const zoomChanged = prevMonthZoomRef.current !== monthZoom;
    const oldZoom = prevMonthZoomRef.current;
    prevMonthZoomRef.current = monthZoom;
    if (!zoomChanged) return;
    const viewport = monthViewportRef.current;
    if (!viewport || viewport.clientWidth <= 0) return;
    const width = viewport.clientWidth;
    viewport.scrollLeft = reanchorScrollLeft(
      viewport.scrollLeft,
      width,
      0,
      (width * oldZoom) / 7,
      (width * monthZoom) / 7,
    );
  }, [monthZoom]);

  // ---- Split handle --------------------------------------------------------
  // The live fraction is written straight to the container's CSS var during a
  // drag (no React render per frame); the committed value lands on release.
  const [dragging, setDragging] = useState(false);
  const dragRectRef = useRef<DOMRect | null>(null);
  const livePctRef = useRef(splitPct);

  const applyLiveSplit = useCallback((pct: number) => {
    livePctRef.current = pct;
    containerRef.current?.style.setProperty("--c2-dual-split", `${pct * 100}%`);
  }, []);

  const endDrag = useCallback(() => {
    if (dragRectRef.current === null) return;
    dragRectRef.current = null;
    setDragging(false);
    // Always commit the last live fraction: a cancel (browser gesture, lost
    // capture) must not leave the DOM's var diverged from the parent state.
    onSplitCommit(livePctRef.current);
  }, [onSplitCommit]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;
      event.preventDefault();
      dragRectRef.current = container.getBoundingClientRect();
      livePctRef.current = splitPct;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    },
    [splitPct],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = dragRectRef.current;
      if (!rect || rect.width <= 0) return;
      const pct = clampDualSplit((event.clientX - rect.left) / rect.width);
      if (pct !== null) applyLiveSplit(pct);
    },
    [applyLiveSplit],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onSplitCommit(stepDualSplit(splitPct, -1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onSplitCommit(stepDualSplit(splitPct, 1));
      }
    },
    [onSplitCommit, splitPct],
  );

  // ---- Agenda pane: day slide + swipe --------------------------------------
  const agendaEvents = useMemo(() => eventsOnDay(events, day), [events, day]);
  // Month-pane chips are deliberately pass-through: a tap selects the day
  // cell beneath it in the Agenda pane. Mantine renders the chip as a root
  // `<button>` with `pointer-events: none` wrapping an inner chip that
  // re-enables `pointer-events: all`, so a root-only override still lets the
  // inner chip capture the tap — and with no `onEventClick` that tap is
  // swallowed instead of reaching the day cell. The `c2-inert-event` class
  // (globals.css) disables the whole chip subtree, so taps fall through to the
  // day-cell button with the correct cell date (chips are absolutely
  // positioned overlays, not children of the cells). `tabIndex: -1` keeps
  // keyboard focus off the dead chips — the day cells keep their roving
  // tabindex, so arrows + Enter still select a day. The highlight classes from
  // `renderMonthEvent` pass through untouched.
  const renderInertMonthEvent = useCallback<DualPaneRenderEvent>(
    (event, props) =>
      renderMonthEvent(event, {
        ...props,
        tabIndex: -1,
        className: `${props.className ?? ""} c2-inert-event`.trim(),
      }),
    [renderMonthEvent],
  );
  // Direction of the last day change, for the directional slide-in (same
  // contract as the Agenda tab / day modal). Render-phase sync — the codebase's
  // derived-state pattern.
  const [prevDay, setPrevDay] = useState(day);
  const [slideDir, setSlideDir] = useState<0 | 1 | -1>(0);
  if (prevDay !== day) {
    const dir = day > prevDay ? 1 : -1;
    setPrevDay(day);
    setSlideDir(dir);
  }
  const swipedRef = useRef(false);
  const resetSwipeSuppression = useCallback(() => {
    swipedRef.current = false;
  }, []);
  const { ref: agendaSwipeRef } = useDrag<HTMLDivElement>(
    (state) => {
      if (!state.last || state.canceled || state.tap) return;
      if (Math.abs(state.movement[0]) < DAY_SWIPE_THRESHOLD) return;
      swipedRef.current = true;
      markAgendaSwipeHintSeen();
      onDaySelect(dayjs(day).add(state.movement[0] < 0 ? 1 : -1, "day").format("YYYY-MM-DD"));
    },
    { axis: "lock", axisThreshold: 8, threshold: 10, filterTaps: true },
  );

  const dayLabel = dayjs(day).format("ddd, MMM D, YYYY");

  return (
    <Box
      ref={containerRef}
      style={
        {
          display: "flex",
          flexDirection: isDesktop ? "row" : "column",
          alignItems: "flex-start",
          gap: isDesktop ? 0 : "var(--mantine-spacing-md)",
          "--c2-dual-split": `${splitPct * 100}%`,
          userSelect: dragging ? "none" : undefined,
        } as CSSProperties
      }
    >
      {/* Month pane: zoomed grid + pinned weekday strip + zoom/pan cluster. */}
      <Box
        ref={monthBoxRef}
        style={{
          flex: isDesktop ? "0 0 var(--c2-dual-split)" : "1 1 auto",
          width: isDesktop ? undefined : "100%",
          minWidth: 0,
          paddingRight: isDesktop ? HANDLE_GUTTER : undefined,
        }}
      >
        <MonthWeekdayStrip
          chromeOffset={chromeOffset}
          zoom={monthZoom}
          innerRef={weekdayTrackRef}
        />
        <MonthView
          date={`${month}-01 00:00:00`}
          events={monthEvents}
          withHeader={false}
          withWeekDays={false}
          styles={{ monthViewInner: monthViewInnerStyle }}
          scrollAreaProps={monthScrollAreaProps}
          maxEventsPerDay={isDesktop ? 4 : 3}
          moreEventsProps={{
            // The library's "+ more" button has no nowrap/ellipsis (unlike the
            // event chips); pin it to one line so it can't bleed into the week
            // below on narrow columns. Styles API root, never `style`.
            styles: {
              moreEventsButton: {
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              },
            },
          }}
          renderEvent={renderInertMonthEvent}
          // No `onEventClick`: every tap (chip or empty cell) must land on the
          // day cell instead (`onDayClick` below selects the shared anchor).
          // The chips are overlays, so the inert render above lets taps fall
          // through to the cell button with the correct cell date.
          onDayClick={(picked) => onDaySelect(picked)}
        />
        {/* Portaled to <body>: the controls are position:fixed, and the
            DashboardView's slide wrapper is transiently transformed (a
            transform makes it the containing block for fixed descendants),
            which would jitter/clip them during a view or date swipe. The
            standalone Month view keeps its controls outside that wrapper for
            the same reason. */}
        <Portal>
          <GridNavControls
            anchorRef={monthBoxRef}
            canScrollLeft={monthPan.canScrollLeft}
            canScrollRight={monthPan.canScrollRight}
            onPan={monthPan.panTo}
            zoom={monthZoom}
            zoomMin={MIN_MONTH_ZOOM}
            zoomMax={MAX_MONTH_ZOOM}
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
          />
        </Portal>
      </Box>

      {/* Draggable split handle (desktop only — the panes stack below lg). */}
      {isDesktop && (
        <Box
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize Month and Agenda panes"
          aria-valuemin={Math.round(DUAL_SPLIT_MIN * 100)}
          aria-valuemax={Math.round(DUAL_SPLIT_MAX * 100)}
          aria-valuenow={Math.round(splitPct * 100)}
          aria-valuetext={`Month pane ${Math.round(splitPct * 100)} percent`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onKeyDown={handleKeyDown}
          onDoubleClick={() => onSplitCommit(DUAL_SPLIT_DEFAULT)}
          style={{
            flex: "0 0 auto",
            alignSelf: "stretch",
            width: HANDLE_WIDTH,
            cursor: "col-resize",
            touchAction: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            outline: "none",
          }}
        >
          <Box
            style={{
              width: 4,
              height: "100%",
              borderRadius: 2,
              backgroundColor: dragging
                ? "var(--mantine-color-accent-6)"
                : "var(--mantine-color-default-border)",
              transition: dragging ? undefined : "background-color 150ms ease",
            }}
          />
        </Box>
      )}

      {/* Agenda pane: sticky day header + the day's list. */}
      <Box style={{ flex: isDesktop ? "1 1 0" : "1 1 auto", width: isDesktop ? undefined : "100%", minWidth: 0 }}>
        <Box
          style={{
            position: "sticky",
            top: `calc(var(--app-shell-header-offset) + ${chromeOffset}px)`,
            zIndex: 45,
            display: "flex",
            alignItems: "center",
            gap: "var(--mantine-spacing-xs)",
            paddingBottom: "var(--mantine-spacing-xs)",
            // The floating fullscreen toggle sits 8px below the chrome and 8px
            // inside the grid's right edge — exactly this header's top-right.
            // Reserve its box (button + inset + a gap) on desktop so the day
            // chevrons stay tappable; below lg the panes stack and the toggle
            // floats over the month strip instead, like the Month view.
            paddingRight: isDesktop
              ? FULLSCREEN_BUTTON_SIZE + FULLSCREEN_EDGE_INSET * 2
              : undefined,
            background: "var(--mantine-color-body)",
            borderBottom: "1px solid var(--mantine-color-default-border)",
          }}
        >
          <Text fw={600} size="sm" lineClamp={1} style={{ flex: 1, minWidth: 0 }}>
            {dayLabel}
          </Text>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label="Previous day"
            onClick={() => onDaySelect(dayjs(day).add(-1, "day").format("YYYY-MM-DD"))}
          >
            <IconChevronLeft size={16} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label="Next day"
            onClick={() => onDaySelect(dayjs(day).add(1, "day").format("YYYY-MM-DD"))}
          >
            <IconChevronRight size={16} />
          </ActionIcon>
        </Box>
        <Box
          ref={agendaSwipeRef}
          style={{ touchAction: "pan-y", overflow: "hidden", marginTop: "var(--mantine-spacing-xs)" }}
          onPointerDown={resetSwipeSuppression}
          onClickCapture={(event) => {
            if (swipedRef.current) {
              event.preventDefault();
              event.stopPropagation();
              swipedRef.current = false;
            }
          }}
        >
          {/* The day key restarts the directional slide-in on every day change. */}
          <div
            key={day}
            className={
              slideDir === 1 ? "agenda-slide-next" : slideDir === -1 ? "agenda-slide-prev" : undefined
            }
          >
            <AgendaView
              rangeStart={day}
              rangeEnd={day}
              events={agendaEvents}
              style={{
                border: "1px solid var(--mantine-color-default-border)",
                borderRadius: "var(--mantine-radius-md)",
                overflow: "hidden",
              }}
              styles={{ agendaViewHeader: { display: "none" } }}
              renderEvent={renderAgendaEvent}
              onEventClick={(event, e) => onEventClick(event as unknown as CalendarEvent, e)}
            />
          </div>
          {showSwipeHint && <AgendaSwipeHint />}
        </Box>
      </Box>
    </Box>
  );
}
