"use client";

import { type RefObject, useLayoutEffect, useState } from "react";
import { ActionIcon, Box } from "@mantine/core";
import { IconTriangleFilled, IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import { layoutRect } from "@/lib/ui/layoutRect";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/ui/slotZoom";

// Shared geometry for the edge controls: 40px round buttons; inside the right
// cluster an 8px gap between elements and a 1px divider between the zoom
// pair(s) and the pan arrow. The cluster's height and anchor derive from these.
const BUTTON_SIZE = 40;
const CLUSTER_GAP = 8;
const DIVIDER_HEIGHT = 1;
const EDGE_INSET = 8;

/**
 * Floating grid-navigation controls for the dashboard's wide grids: the zoom
 * in/out pair and the horizontal pan arrows, presented as one right-edge
 * control cluster (the familiar map convention) plus a single left-edge pan
 * arrow. Served by the Day/Week (H) **timeline** zoom (slotZoom.ts), the Month
 * grid's fit-width zoom (monthZoom.ts), and the Week (Grid)'s **two-axis** zoom
 * — the caller passes its own level range via `zoomMin`/`zoomMax` (and, for the
 * two-axis case, a `secondaryZoom` group), since each uses different level sets.
 *
 * Why one cluster: a timeline zoom is expected beside the pan controls, not as
 * a second floating widget competing for the right edge, and a single stacked
 * widget can never overlap itself. The left pan arrow stays edge-anchored on
 * the left so "scroll left" still reads from the left edge; the right edge
 * hosts the zoom pair(s) and the right pan arrow together. Single-axis views
 * (Day/Week (H)/Month) center the WHOLE cluster — the zoom pair above, the
 * right pan arrow below — on the grid's visible-slice center; the left pan
 * arrow stays edge-anchored at that center, so the right pan arrow now rides
 * below it. The two-axis view (Week (Grid)) is already symmetric: the primary
 * (columns) pair sits ABOVE the right pan arrow and the secondary (rows) pair
 * BELOW it, anchored so the arrow's center lands on the anchor center. In the
 * two-axis case the arrow slot (plus its dividers) does not depend on
 * `canScrollRight` — it is reserved and hidden when the grid fits without
 * overflowing — so nothing shifts when the arrow appears or disappears while
 * panning. The zoom pair(s) render whenever the grid is shown (zoom is useful
 * even when it fits without overflowing); the pan arrows render only when that
 * edge can scroll. Subdued circular grey with filled triangles: intentionally
 * lighter than the date-nav chevrons so the controls read as secondary chrome.
 *
 * The controls are `position: fixed` and their anchor is measured on view load
 * and re-measured on window resize, anchor size change, or a `layoutKey` flip
 * (the caller's breakpoint + measured chrome height) — never per scroll frame.
 * The anchor's rect is read with `layoutRect` (transform-free layout geometry,
 * not `getBoundingClientRect`): for Week (D) and Month & Agenda the anchor sits
 * inside the dashboard's transiently transformed slide wrapper, so the visual
 * rect would otherwise be captured mid-slide and leave the controls displaced
 * (left or right, by the slide direction) until a resize. There is no scroll
 * listener, so the controls hold perfectly still at the calendar's visible-area
 * center while the page scrolls.
 * (Tracking the visible slice on scroll moved the buttons with the calendar —
 * on grids shorter than the viewport they travelled toward the screen edge and
 * stuttered as the browser coalesced scroll frames; a pure-CSS sticky rail
 * instead pinned them to the grid's own box, so they rode out of view with it.)
 * The anchor is the grid's **visible-slice** center, never the raw viewport
 * center: the slice starts below the sticky chrome, so this keeps the cluster
 * clear of the lg-only floating fullscreen toggle at the top-right on short
 * viewports.
 */
export function GridNavControls({
  anchorRef,
  canScrollLeft,
  canScrollRight,
  onPan,
  zoom,
  onZoomIn,
  onZoomOut,
  zoomMin = MIN_ZOOM,
  zoomMax = MAX_ZOOM,
  label,
  secondaryZoom,
  layoutKey,
  bottomBarrierRef,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  onPan: (edge: "start" | "end") => void;
  /** Current zoom level (a pure number — the day/week and month views use
   *  different level sets, see slotZoom.ts / monthZoom.ts). */
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Level extremes that disable the pair; default to the timeline zoom's.
   *  The Month grid passes its own fit-width floor (1) and max. */
  zoomMin?: number;
  zoomMax?: number;
  /**
   * Name of the primary zoom axis (e.g. `"Columns"`), used in the pair's
   * accessible labels/tooltips. Omit for the generic "Zoom in"/"Zoom out".
   */
  label?: string;
  /**
   * An optional second zoom pair for views with two independent axes (Week
   * (Grid): columns + rows). When present the cluster splits around the right
   * pan arrow: the primary pair above it, this one below (each side of the
   * arrow behind its own divider). Each pair disables its own buttons at its
   * own min/max.
   */
  secondaryZoom?: {
    value: number;
    onIn: () => void;
    onOut: () => void;
    min?: number;
    max?: number;
    /** Axis name for the pair's labels/tooltips, e.g. `"Rows"`. */
    label?: string;
  };
  /**
   * Layout identity the fixed position depends on (the caller passes its
   * breakpoint/chrome measurement). When it changes the anchor is re-measured
   * after commit, so a desktop↔mobile flip re-anchors the controls instead of
   * leaving them at the previous layout's offsets.
   */
  layoutKey?: string | number | boolean;
  /**
   * Optional element that owns the viewport's bottom-right corner (the
   * dashboard's right FAB row (chevron pill + create pill) below `lg`): the
   * visible slice is clamped to its top, so the cluster never parks
   * behind it on document-scrolling grids.
   */
  bottomBarrierRef?: RefObject<HTMLElement | null> | null;
}) {
  const canZoomIn = zoom < zoomMax;
  const canZoomOut = zoom > zoomMin;

  // Static anchor: the visible-slice center/bounds plus the 8px edge insets,
  // measured on load and re-measured per the triggers below (null before first
  // paint so the controls never flash unanchored).
  const [pos, setPos] = useState<{
    center: number;
    left: number;
    right: number;
    visibleTop: number;
    visibleBottom: number;
  } | null>(null);

  useLayoutEffect(() => {
    // Read the anchor fresh on every pass (never close over the mount-time
    // node): a remounted anchor must be re-measured, not the detached one.
    const measure = () => {
      const anchor = anchorRef.current;
      if (!anchor) {
        return;
      }
      const rect = layoutRect(anchor);
      // The visible slice is the anchor's rect clamped to the window (and to
      // the bottom barrier's top when one is given — the dashboard's bottom
      // toolbar below `lg`). If the anchor is entirely off-screen at
      // measurement time, fall back to the full viewport so the controls still
      // render somewhere sensible.
      const visibleTop = Math.max(rect.top, 0);
      const barrier = bottomBarrierRef?.current;
      const barrierTop = barrier ? layoutRect(barrier).top : window.innerHeight;
      const visibleBottom = Math.min(rect.bottom, window.innerHeight, barrierTop);
      const onScreen = visibleTop < visibleBottom;
      // 8px inside each grid edge; clamp to the anchor's own midpoint so a very
      // narrow grid can't push the controls off-screen or onto each other. The
      // anchor midpoint (not the viewport's) matters for the Dual Pane's Month
      // pane: it lives in the left portion of the viewport, so clamping to the
      // viewport centre would freeze the cluster mid-screen once the pane's
      // right edge crossed it. Full-width grids have their midpoint at the
      // viewport centre, so this is identical to the old clamp there.
      const anchorCenterX = (rect.left + rect.right) / 2;
      setPos({
        center: onScreen ? (visibleTop + visibleBottom) / 2 : window.innerHeight / 2,
        left: Math.min(rect.left + EDGE_INSET, anchorCenterX),
        right: Math.min(window.innerWidth - rect.right + EDGE_INSET, window.innerWidth - anchorCenterX),
        visibleTop: onScreen ? visibleTop : 0,
        visibleBottom: onScreen ? visibleBottom : window.innerHeight,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    const anchor = anchorRef.current;
    if (anchor) {
      observer.observe(anchor);
    }
    const barrier = bottomBarrierRef?.current;
    if (barrier) {
      observer.observe(barrier);
    }
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [anchorRef, bottomBarrierRef, layoutKey]);

  if (!pos) {
    return null;
  }

  // The right-edge cluster's top edge, per shape:
  //
  // Single-axis (Day/Week (H)/Month): center anchor. The whole cluster — the
  // zoom pair above, the right pan arrow below (when it renders) — is centered
  // on the grid's visible-slice center and clamped to the visible bounds, so
  // it never bleeds past either edge. On strips shorter than the cluster it
  // overflows evenly around the center. The left pan arrow keeps its own
  // center anchor, so it no longer lines up with the right one.
  //
  // Two-axis (Week (Grid)): the pan arrow sits in the MIDDLE of the cluster
  // (primary/columns pair above, secondary/rows pair below), so the anchor is
  // the arrow slot's center at `pos.center`. The arrow slot and its two
  // divider slots are always reserved (hidden, space kept) when the grid
  // fits without overflowing — the cluster height is fixed — so the pairs
  // never shift as the arrow appears/disappears while panning.
  const isTwoAxis = secondaryZoom !== undefined;
  // Two-axis cluster height: 5 button slots (4 zoom + 1 reserved arrow) +
  // 2 reserved divider slots + 6 gaps.
  const TWO_AXIS_CLUSTER_HEIGHT =
    BUTTON_SIZE * 5 + DIVIDER_HEIGHT * 2 + CLUSTER_GAP * 6;
  // The reserved arrow slot's center, from the cluster's top edge: primary
  // pair (2 buttons + their gap), gap + divider + gap to the slot, half a
  // button.
  const ARROW_CENTER_FROM_TOP =
    BUTTON_SIZE * 2 + CLUSTER_GAP * 3 + DIVIDER_HEIGHT + BUTTON_SIZE / 2;

  let clusterTop: number;
  if (isTwoAxis) {
    const sliceHeight = pos.visibleBottom - pos.visibleTop;
    clusterTop =
      TWO_AXIS_CLUSTER_HEIGHT > sliceHeight
        ? (pos.visibleTop + pos.visibleBottom) / 2 - TWO_AXIS_CLUSTER_HEIGHT / 2
        : Math.max(
            pos.visibleTop,
            Math.min(pos.center - ARROW_CENTER_FROM_TOP, pos.visibleBottom - TWO_AXIS_CLUSTER_HEIGHT),
          );
  } else {
    const itemCount = 2 + (canScrollRight ? 1 : 0);
    const dividerCount = canScrollRight ? 1 : 0;
    const clusterHeight =
      BUTTON_SIZE * itemCount +
      CLUSTER_GAP * (itemCount + dividerCount - 1) +
      DIVIDER_HEIGHT * dividerCount;
    // Center the WHOLE cluster (zoom pair + pan arrow) on the grid's
    // visible-slice center, then clamp so it never bleeds past either edge. On
    // strips shorter than the cluster it overflows evenly around the center
    // rather than being pinned to one edge. The left pan arrow stays at
    // `pos.center`, so the right pan arrow now rides below it.
    const sliceHeight = pos.visibleBottom - pos.visibleTop;
    clusterTop =
      clusterHeight > sliceHeight
        ? (pos.visibleTop + pos.visibleBottom) / 2 - clusterHeight / 2
        : Math.max(
            pos.visibleTop,
            Math.min(pos.center - clusterHeight / 2, pos.visibleBottom - clusterHeight),
          );
  }

  const renderDivider = (hidden = false) => (
    <Box
      aria-hidden
      style={{
        width: 24,
        height: DIVIDER_HEIGHT,
        borderRadius: 1,
        // Two-axis case: the dividers flanking the reserved arrow slot keep
        // their space (hidden) when the arrow isn't there, so the zoom pairs
        // never shift.
        visibility: hidden ? "hidden" : undefined,
        backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-5) 60%, transparent)",
      }}
    />
  );

  const rightPanArrow = (
    <ActionIcon
      size={BUTTON_SIZE}
      radius="50%"
      variant="filled"
      color="gray"
      className="c2-glass-btn"
      aria-label="Scroll grid right"
      onClick={() => onPan("end")}
    >
      <IconTriangleFilled size={14} style={{ transform: "rotate(90deg)" }} />
    </ActionIcon>
  );

  // The reserved arrow slot when the grid fits without overflowing: an inert
  // same-size spacer (not a hidden button — nothing to focus or announce).
  const arrowSlotSpacer = (
    <Box component="div" aria-hidden style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }} />
  );

  // A zoom pair for one axis. `name` is the axis word (already lowercased) or
  // "" for the generic labels the single-axis views have always used.
  const renderZoomPair = (
    onIn: () => void,
    onOut: () => void,
    canIn: boolean,
    canOut: boolean,
    name: string,
  ) => {
    const inLabel = name ? `Zoom ${name} in` : "Zoom in";
    const outLabel = name ? `Zoom ${name} out` : "Zoom out";
    return (
      <>
        <ActionIcon
          size={BUTTON_SIZE}
          radius="50%"
          variant="filled"
          color="gray"
          className="c2-glass-btn"
          aria-label={inLabel}
          title={inLabel}
          disabled={!canIn}
          onClick={onIn}
        >
          <IconZoomIn size={18} />
        </ActionIcon>
        <ActionIcon
          size={BUTTON_SIZE}
          radius="50%"
          variant="filled"
          color="gray"
          className="c2-glass-btn"
          aria-label={outLabel}
          title={outLabel}
          disabled={!canOut}
          onClick={onOut}
        >
          <IconZoomOut size={18} />
        </ActionIcon>
      </>
    );
  };

  return (
    <>
      {canScrollLeft && (
        <ActionIcon
          style={{
            position: "fixed",
            top: pos.center,
            left: pos.left,
            transform: "translateY(-50%)",
            // Below the sticky date-nav chrome (50) and the modals; above the
            // grids' internal stickies (<= 20).
            zIndex: 30,
          }}
          size={BUTTON_SIZE}
          radius="50%"
          variant="filled"
          color="gray"
          className="c2-glass-btn"
          aria-label="Scroll grid left"
          onClick={() => onPan("start")}
        >
          <IconTriangleFilled size={14} style={{ transform: "rotate(-90deg)" }} />
        </ActionIcon>
      )}

      <Box
        component="div"
        role="group"
        aria-label="Grid navigation"
        style={{
          position: "fixed",
          top: clusterTop,
          right: pos.right,
          zIndex: 30,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: CLUSTER_GAP,
          width: BUTTON_SIZE,
        }}
      >
        {secondaryZoom ? (
          // Two-axis (Week (Grid)): primary (columns) pair above the right pan
          // arrow, secondary (rows) pair below it. The arrow slot and its
          // dividers are reserved whether or not the arrow renders (see the
          // geometry above), so the pairs hold still while panning.
          <>
            {renderZoomPair(onZoomIn, onZoomOut, canZoomIn, canZoomOut, label?.toLowerCase() ?? "")}
            {renderDivider(!canScrollRight)}
            {canScrollRight ? rightPanArrow : arrowSlotSpacer}
            {renderDivider(!canScrollRight)}
            {renderZoomPair(
              secondaryZoom.onIn,
              secondaryZoom.onOut,
              secondaryZoom.value < (secondaryZoom.max ?? MAX_ZOOM),
              secondaryZoom.value > (secondaryZoom.min ?? MIN_ZOOM),
              secondaryZoom.label?.toLowerCase() ?? "",
            )}
          </>
        ) : (
          <>
            {renderZoomPair(onZoomIn, onZoomOut, canZoomIn, canZoomOut, label?.toLowerCase() ?? "")}
            {canScrollRight && (
              <>
                {renderDivider()}
                {rightPanArrow}
              </>
            )}
          </>
        )}
      </Box>
    </>
  );
}