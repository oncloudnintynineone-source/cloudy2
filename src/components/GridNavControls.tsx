"use client";

import { type RefObject, useLayoutEffect, useState } from "react";
import { ActionIcon, Box } from "@mantine/core";
import { IconTriangleFilled, IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import { markPinchHintSeen } from "@/lib/ui/pinchHint";
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
 * (Day/Week (H)/Month) hang the cluster from its bottom edge so the right pan
 * arrow's center lands on the grid's visible-slice center — vertically aligned
 * with the left pan arrow — with the zoom pair's slot above it. The two-axis
 * view (Week (Grid)) splits instead: the primary (columns) pair sits ABOVE the
 * right pan arrow and the secondary (rows) pair BELOW it, and the cluster is
 * anchored so the arrow's center lands on the anchor center. Either way the
 * arrow slot (plus its dividers in the two-axis case) does not depend on
 * `canScrollRight` — it is reserved and hidden when the grid fits without
 * overflowing — so nothing shifts when the arrow appears or disappears while
 * panning. The zoom pair(s) render whenever the grid is shown (zoom is useful
 * even when it fits without overflowing); the pan arrows render only when that
 * edge can scroll. Subdued circular grey with filled triangles: intentionally
 * lighter than the date-nav chevrons so the controls read as secondary chrome.
 *
 * The controls are `position: fixed` and their anchor is measured on view load
 * and re-measured on window resize, anchor/parent size change, a `layoutKey`
 * flip, and a one-shot post-mount settle pass (next frame + webfonts) — never
 * per scroll frame. The cold-load settle matters: the anchor's final box is not
 * always laid out when the first measurement runs, and the settle can be a
 * position/overflow change the `ResizeObserver` never reports (the controls
 * otherwise stayed off to the side until a resize). There is no scroll
 * listener, so the controls hold perfectly still at the calendar's visible-area
 * center while the page scrolls.
 * (Tracking the visible slice on scroll moved the buttons with the calendar —
 * on grids shorter than the viewport they travelled toward the screen edge and
 * stuttered as the browser coalesced scroll frames; a pure-CSS sticky rail
 * instead pinned them to the grid's own box, so they rode out of view with it.)
 * The anchor is the grid's **visible-slice** center, never the raw viewport
 * center: the slice starts below the sticky chrome, so this keeps the cluster
 * clear of the floating fullscreen toggle at the top-right on short viewports.
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
  showPinchHint = false,
  secondaryZoom,
  layoutKey,
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
   * Show the one-time "Pinch to zoom" caption beside the cluster (touch
   * devices, until the hint is dismissed — see `src/lib/ui/pinchHint.ts`).
   * Naming the labelled axes keeps it honest on the two-axis Week (Grid).
   */
  showPinchHint?: boolean;
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
      const rect = anchor.getBoundingClientRect();
      // The visible slice is the anchor's rect clamped to the window. If the
      // anchor is entirely off-screen at measurement time, fall back to the
      // full viewport so the controls still render somewhere sensible.
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, window.innerHeight);
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
    // Cold-load settle: the anchor's final box is not always laid out when the
    // first pass runs, and the settle can be a position/overflow change the
    // ResizeObserver never reports. Re-measure once the browser has completed a
    // full frame (and again once webfonts load, which can shift the chrome).
    const frame = requestAnimationFrame(measure);
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) {
        measure();
      }
    });
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    const anchor = anchorRef.current;
    if (anchor) {
      observer.observe(anchor);
      // The anchor can shift when its parent resizes while its own box stays
      // the same; observe the parent so that settle is caught too.
      if (anchor.parentElement) {
        observer.observe(anchor.parentElement);
      }
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [anchorRef, layoutKey]);

  if (!pos) {
    return null;
  }

  const buttonStyles = {
    root: {
      backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 50%, transparent)",
      "&:where([data-disabled])": {
        backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 50%, transparent)",
      },
      "&:where(:hover)": {
        backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 60%, transparent)",
      },
    },
  } as const;

  // The right-edge cluster's top edge, per shape:
  //
  // Single-axis (Day/Week (H)/Month): bottom-edge anchor. The bottom of the
  // cluster — the right pan arrow (or the zoom pair when the arrow is
  // hidden) — is clamped so the arrow's center lands on the grid's
  // visible-slice center, vertically aligned with the left pan arrow; the
  // zoom pair's slot above stays fixed whether or not the arrow currently
  // renders, so panning never shifts it. On strips shorter than the cluster
  // the zoom pair overflows above rather than pushing the arrow out the
  // bottom.
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
    const zoomButtonCount = 2;
    const dividerCount = canScrollRight ? 1 : 0;
    const itemCount = zoomButtonCount + (canScrollRight ? 1 : 0);
    const clusterHeight =
      BUTTON_SIZE * itemCount +
      CLUSTER_GAP * (itemCount + dividerCount - 1) +
      DIVIDER_HEIGHT * dividerCount;
    const desiredBottom = canScrollRight
      ? pos.center + BUTTON_SIZE / 2
      : pos.center - (BUTTON_SIZE / 2 + CLUSTER_GAP + DIVIDER_HEIGHT + CLUSTER_GAP);
    const clusterBottom = Math.min(
      Math.max(desiredBottom, pos.visibleTop + clusterHeight),
      pos.visibleBottom,
    );
    clusterTop = clusterBottom - clusterHeight;
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
      styles={buttonStyles}
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
          styles={buttonStyles}
          aria-label={inLabel}
          title={inLabel}
          disabled={!canIn}
          onClick={() => {
            // Using any zoom control dismisses the one-time pinch hint.
            markPinchHintSeen();
            onIn();
          }}
        >
          <IconZoomIn size={18} />
        </ActionIcon>
        <ActionIcon
          size={BUTTON_SIZE}
          radius="50%"
          variant="filled"
          color="gray"
          styles={buttonStyles}
          aria-label={outLabel}
          title={outLabel}
          disabled={!canOut}
          onClick={() => {
            markPinchHintSeen();
            onOut();
          }}
        >
          <IconZoomOut size={18} />
        </ActionIcon>
      </>
    );
  };

  // Axis-aware caption: the two-axis Week (Grid) cluster labels its pairs
  // ("Columns" / "Rows"), so the hint names both; the single-axis clusters
  // (Day / Week (H), Month) have no label and stay generic.
  const pinchHintText = label
    ? secondaryZoom?.label
      ? `Pinch to zoom ${label.toLowerCase()} / ${secondaryZoom.label.toLowerCase()}`
      : `Pinch to zoom ${label.toLowerCase()}`
    : "Pinch to zoom";

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
          styles={buttonStyles}
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

      {/* One-time pinch hint (touch only, dismissed on use — see
          src/lib/ui/pinchHint.ts): a small tooltip pill just left of the button
          column, anchored like the cluster and never interactive. Decorative —
          the zoom buttons carry the accessible names. */}
      {showPinchHint && (
        <Box
          component="div"
          aria-hidden
          style={{
            position: "fixed",
            top: pos.center,
            right: pos.right + BUTTON_SIZE + CLUSTER_GAP,
            transform: "translateY(-50%)",
            zIndex: 30,
            pointerEvents: "none",
            userSelect: "none",
            whiteSpace: "nowrap",
            padding:
              "calc(0.25rem * var(--mantine-scale)) calc(0.625rem * var(--mantine-scale))",
            borderRadius: "var(--mantine-radius-xl)",
            border: "1px solid var(--mantine-color-default-border)",
            background: "var(--mantine-color-body)",
            boxShadow: "var(--mantine-shadow-sm)",
            color: "var(--mantine-color-dimmed)",
            fontSize: "var(--mantine-font-size-xs)",
            lineHeight: 1.4,
          }}
        >
          {pinchHintText}
        </Box>
      )}
    </>
  );
}