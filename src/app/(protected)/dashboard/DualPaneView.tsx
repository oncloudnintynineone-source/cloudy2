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
 * Layout: at `lg` and up a row bounded to the viewport's remaining height —
 * Month pane at the device-remembered split fraction, a draggable handle, then
 * the Agenda pane — where each pane is a fixed-header column with its own
 * vertical scroll (so scrolling one never moves the other). The split is a CSS
 * custom property (`--c2-dual-split`) written straight to the DOM during a
 * drag, so resizing re-lays out both panes with no React work per pointer
 * frame; the committed value is persisted by the parent (`onSplitCommit`).
 *
 * Below `lg` the Agenda pane is hidden and the Month pane behaves exactly like
 * the standalone Month view: chips open the event detail, a day cell opens the
 * shared agenda day modal (`onDayOpen`), and the document scrolls.
 *
 * The Month pane keeps the standalone Month view's fit-to-width zoom
 * (`monthZoom`) and its own pan instance; the Agenda pane (at `lg` and up)
 * keeps the Agenda tab's day header, swipe-to-change-day gesture and
 * once-per-session hint. At `lg` and up, tapping a day cell in the grid
 * selects that day in the Agenda pane (chips are pass-through — see
 * `renderInertMonthEvent`).
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
import "@mantine/schedule/styles.css";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

import { GridNavControls } from "@/components/GridNavControls";
import { FULLSCREEN_BUTTON_SIZE, FULLSCREEN_EDGE_INSET } from "@/components/FullscreenToggle";
import { eventsOnDay } from "@/lib/events/agenda";
import type { CalendarEvent } from "@/lib/events/queries";
import type { Rect } from "@/lib/motion/origin";
import { markAgendaSwipeHintSeen } from "@/lib/ui/agendaSwipeHint";
import {
  DUAL_SPLIT_DEFAULT,
  DUAL_SPLIT_MAX,
  DUAL_SPLIT_MIN,
  clampDualSplit,
  stepDualSplit,
} from "@/lib/ui/dualSplit";
import { announce } from "@/lib/ui/announcer";
import { useGridPan } from "@/lib/ui/gridPan";
import { clampMonthZoom, MAX_MONTH_ZOOM, MIN_MONTH_ZOOM, type MonthZoom } from "@/lib/ui/monthZoom";
import { usePinchZoom } from "@/lib/ui/pinchZoom";
import { animateZoom, scrollAnchorTracker } from "@/lib/ui/zoomAnim";
import { AgendaSwipeHint } from "@/components/AgendaSwipeHint";
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
  /** Commit an arbitrary Month-pane zoom level (pinch-to-zoom). */
  onMonthZoomChange: (next: MonthZoom) => void;
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
  /**
   * Narrow only (below `lg`, where the agenda pane is hidden): open the shared
   * agenda day modal for a tapped cell — the standalone Month view's cell tap.
   */
  onDayOpen: (day: string, origin: Rect) => void;
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
 * Month-pane scroll-content width. Mirrors DashboardView's MONTH_INNER_STYLE:
 * rides the shared `--c2-zoom` / `--c2-zoom-anim` (published by the dashboard
 * and overridden locally during a zoom animation), so the day columns animate
 * in step with the scroll re-anchor.
 */
const MONTH_INNER_STYLE = {
  width: "calc(var(--c2-zoom-anim, var(--c2-zoom)) * 100%)",
  "--min-day-width": "0px",
} as CSSProperties;

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
  onMonthZoomChange,
  splitPct,
  onSplitCommit,
  renderMonthEvent,
  renderAgendaEvent,
  onEventClick,
  onDaySelect,
  onDayOpen,
  showSwipeHint,
  chromeOffset,
}: DualPaneViewProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const monthBoxRef = useRef<HTMLDivElement | null>(null);

  // ---- Month pane: pan + zoomed scroll tracking (mirrors the Month tab) ----
  // `pan-x pan-y` keeps native panning but stops the browser page-pinching
  // over the pane, so the pinch handler below owns the two-finger gesture.
  const monthPan = useGridPan({ touchAction: "pan-x pan-y" });
  const monthViewportRef = useRef<HTMLDivElement | null>(null);
  // Pinch-to-zoom (touch): the gesture midpoint is stashed for the re-anchor
  // below so the column under the fingers stays put (buttons use the centre).
  const monthPinchBaseRef = useRef<MonthZoom>(monthZoom);
  const monthPinchFocalRef = useRef<number | undefined>(undefined);
  const monthPinch = usePinchZoom({
    onStart: () => {
      monthPinchBaseRef.current = monthZoom;
    },
    onPinch: ({ scale, focalX }) => {
      const next = clampMonthZoom(monthPinchBaseRef.current * scale);
      if (next === null || next === monthZoom) return;
      monthPinchFocalRef.current = focalX;
      onMonthZoomChange(next);
    },
    onEnd: () => announce(`Zoom ${Math.round(monthZoom * 100)}%`),
  });
  const monthGridViewportRef = useMergedRef(monthViewportRef, monthPan.viewportRef, monthPinch.ref);
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
  // Zoom re-anchor: keep the column under the viewport's center centered (no
  // label column — the scale ratio is just oldZoom → newZoom). One
  // `animateZoom` drives the pane's width (`--c2-zoom-anim`, read by the grid
  // and the weekday strip) and the scroll together.
  const prevMonthZoomRef = useRef(monthZoom);
  useLayoutEffect(() => {
    const zoomChanged = prevMonthZoomRef.current !== monthZoom;
    const oldZoom = prevMonthZoomRef.current;
    prevMonthZoomRef.current = monthZoom;
    if (!zoomChanged) return;
    const viewport = monthViewportRef.current;
    const owner = containerRef.current;
    if (!viewport || !owner || viewport.clientWidth <= 0) return;
    const focalX = monthPinchFocalRef.current;
    monthPinchFocalRef.current = undefined;
    const tracker = scrollAnchorTracker(viewport, { label: 0, focal: focalX });
    animateZoom(owner, {
      from: oldZoom,
      to: monthZoom,
      apply: (z) => owner.style.setProperty("--c2-zoom-anim", String(z)),
      onStart: tracker.capture,
      onScroll: () => tracker.apply(),
      onDone: () => owner.style.removeProperty("--c2-zoom-anim"),
    });
  }, [monthZoom]);

  // The month grid is always exactly six week rows (`MONTH_GRID_WEEKS`), and
  // Mantine sizes each row from `--month-view-max-events` (52px + N * 24px).
  // On a tall desktop pane the fixed 4-event rows (~888px) fall short of the
  // bounded pane and leave a blank strip below the grid, so measure the pane's
  // scroll box and hand Mantine a fractional N that makes the six rows fill it
  // exactly. The floor of 4 events keeps the natural row height (and the pane's
  // own scroll) on shorter viewports, so nothing regresses below the threshold.
  const monthScrollRef = useRef<HTMLDivElement | null>(null);
  const [monthScrollHeight, setMonthScrollHeight] = useState(0);
  useLayoutEffect(() => {
    const el = monthScrollRef.current;
    if (!el || !isDesktop) {
      setMonthScrollHeight(0);
      return;
    }
    const update = () => setMonthScrollHeight(el.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isDesktop]);
  const monthFillStyle = useMemo<CSSProperties | undefined>(() => {
    if (!isDesktop || monthScrollHeight <= 0) {
      return undefined;
    }
    // 148px = 52 + 4 * 24 (the natural four-event row); subtract the six 1px
    // row borders so the filled grid lands just inside the pane.
    const rowHeight = Math.max(148, (monthScrollHeight - 6) / 6);
    return { "--month-view-max-events": String((rowHeight - 52) / 24) } as CSSProperties;
  }, [isDesktop, monthScrollHeight]);

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
  // Month-pane chips are deliberately pass-through AT LG AND UP: a tap selects
  // the day cell beneath it in the Agenda pane. Mantine renders the chip as a
  // root `<button>` with `pointer-events: none` wrapping an inner chip that
  // re-enables `pointer-events: all`, so a root-only override still lets the
  // inner chip capture the tap — and with no `onEventClick` that tap is
  // swallowed instead of reaching the day cell. The `c2-inert-event` class
  // (globals.css) disables the whole chip subtree, so taps fall through to the
  // day-cell button with the correct cell date (chips are absolutely
  // positioned overlays, not children of the cells). `tabIndex: -1` keeps
  // keyboard focus off the dead chips — the day cells keep their roving
  // tabindex, so arrows + Enter still select a day. The highlight classes from
  // `renderMonthEvent` pass through untouched. Below `lg` the Agenda pane is
  // hidden, so the chips render live (the standalone Month view's wiring) and
  // open the event detail instead.
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
      onDaySelect(
        dayjs(day)
          .add(state.movement[0] < 0 ? 1 : -1, "day")
          .format("YYYY-MM-DD"),
      );
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
          // At lg the panes are bounded to the viewport and each owns its
          // vertical scroll (below lg only the month pane renders and the
          // document scrolls).
          alignItems: isDesktop ? "stretch" : "flex-start",
          gap: isDesktop ? 0 : "var(--mantine-spacing-md)",
          ...(isDesktop
            ? {
                height: `calc(var(--app-shell-vh, 100dvh) - var(--app-shell-header-offset) - var(--app-shell-footer-offset) - var(--app-shell-padding) - var(--mantine-spacing-xl) - var(--mantine-spacing-sm) - ${chromeOffset}px)`,
                overflow: "hidden",
              }
            : null),
          "--c2-dual-split": `${splitPct * 100}%`,
          // The pane's zoom multiplier; the month inner + strip derive from it
          // (and the local `--c2-zoom-anim` during a zoom animation).
          "--c2-zoom": monthZoom,
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
          // Bounded column at lg: fixed strip + the pane's own vertical scroll.
          display: isDesktop ? "flex" : undefined,
          flexDirection: isDesktop ? "column" : undefined,
          minHeight: isDesktop ? 0 : undefined,
        }}
      >
        <MonthWeekdayStrip
          chromeOffset={chromeOffset}
          innerRef={weekdayTrackRef}
          sticky={!isDesktop}
        />
        <Box
          ref={monthScrollRef}
          style={
            isDesktop
              ? {
                  flex: "1 1 auto",
                  minHeight: 0,
                  overflowY: "auto",
                  overflowX: "hidden",
                  overscrollBehavior: "contain",
                }
              : undefined
          }
        >
          <MonthView
            date={`${month}-01 00:00:00`}
            events={monthEvents}
            withHeader={false}
            withWeekDays={false}
            styles={{ monthViewInner: MONTH_INNER_STYLE }}
            style={monthFillStyle}
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
            // At lg and up the chips are pass-through (renderInertMonthEvent):
            // every tap (chip or empty cell) must land on the day cell, whose
            // tap selects the shared anchor for the Agenda pane. Below `lg` the
            // Agenda pane is hidden and the grid is the standalone Month view —
            // live chips open the event detail, a cell tap opens the shared day
            // modal.
            renderEvent={isDesktop ? renderInertMonthEvent : renderMonthEvent}
            onEventClick={
              isDesktop
                ? undefined
                : (event, e) => onEventClick(event as unknown as CalendarEvent, e)
            }
            onDayClick={
              isDesktop
                ? (picked) => onDaySelect(picked)
                : (picked, e) => onDayOpen(picked, e.currentTarget.getBoundingClientRect())
            }
          />
        </Box>
        {/* Portaled to <body>: the controls are position:fixed, and the
            DashboardView's slide wrapper is transiently transformed (a
            transform makes it the containing block for fixed descendants),
            which would jitter/clip them during a view or date swipe. The
            standalone Month view keeps its controls outside that wrapper for
            the same reason. */}
        <Portal>
          <GridNavControls
            anchorRef={monthBoxRef}
            layoutKey={isDesktop}
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

      {/* Draggable split handle (desktop only — the agenda pane is hidden
          below lg, so there is nothing to resize against). */}
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

      {/* Agenda pane: desktop only — below `lg` the view is the standalone
          Month view (the shared day modal is the day-detail surface). */}
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
          <Box
            style={{
              // Bounded column: the header is the fixed top of this pane's own
              // scroll column, so a chrome-relative sticky would push it down.
              position: "relative",
              flex: "0 0 auto",
              zIndex: 45,
              display: "flex",
              alignItems: "center",
              gap: "var(--mantine-spacing-xs)",
              paddingBottom: "var(--mantine-spacing-xs)",
              // The floating fullscreen toggle sits 8px below the chrome and
              // 8px inside the grid's right edge — exactly this header's
              // top-right. Reserve its box (button + inset + a gap) so the day
              // chevrons stay tappable.
              paddingRight: FULLSCREEN_BUTTON_SIZE + FULLSCREEN_EDGE_INSET * 2,
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
            style={{
              touchAction: "pan-y",
              flex: "1 1 auto",
              minHeight: 0,
              // A flex column so the card below fills the pane (its own body
              // scrolls a long day) instead of leaving blank space under a
              // content-height card; the swipe hint stays pinned beneath it.
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              overscrollBehavior: "contain",
              marginTop: "var(--mantine-spacing-xs)",
            }}
            onPointerDown={resetSwipeSuppression}
            onClickCapture={(event) => {
              if (swipedRef.current) {
                event.preventDefault();
                event.stopPropagation();
                swipedRef.current = false;
              }
            }}
          >
            {/* The day key restarts the directional slide-in on every day
                change. */}
            <div
              key={day}
              className={
                slideDir === 1
                  ? "agenda-slide-next"
                  : slideDir === -1
                    ? "agenda-slide-prev"
                    : undefined
              }
              style={{
                flex: "1 1 auto",
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <AgendaView
                rangeStart={day}
                rangeEnd={day}
                events={agendaEvents}
                style={{
                  flex: "1 1 auto",
                  minHeight: 0,
                  border: "1px solid var(--mantine-color-default-border)",
                  borderRadius: "var(--mantine-radius-md)",
                  overflow: "hidden",
                  // The root is `overflow: hidden` (a scroll container), so a
                  // gesture starting on the card's own area would otherwise be
                  // owned by the browser; `pan-y` hands horizontal to the swipe
                  // (see the body below).
                  touchAction: "pan-y",
                }}
                styles={{
                  agendaViewHeader: { display: "none" },
                  // The card fills the pane; a long day list scrolls inside it
                  // rather than leaving blank space below a short card. The body
                  // is a scroll container nested inside the swipe container, and
                  // the browser intersects `touch-action` only up to the first
                  // containing scrolling element — without `pan-y` here the
                  // outer swipe container's value is never consulted, the browser
                  // claims the horizontal pan, `pointercancel` fires and the day
                  // swipe is dropped. `pan-y` keeps the vertical scroll native
                  // while the app owns horizontal.
                  agendaViewBody: { overflowY: "auto", minHeight: 0, touchAction: "pan-y" },
                }}
                renderEvent={renderAgendaEvent}
                onEventClick={(event, e) => onEventClick(event as unknown as CalendarEvent, e)}
              />
            </div>
            {showSwipeHint && <AgendaSwipeHint />}
          </Box>
        </Box>
      )}
    </Box>
  );
}
