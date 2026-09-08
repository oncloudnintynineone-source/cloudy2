"use client";

import { type RefObject, useEffect, useState } from "react";
import { ActionIcon, Box } from "@mantine/core";
import { IconTriangleFilled, IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/ui/slotZoom";

// Shared geometry for the edge controls: 40px round buttons; inside the right
// cluster an 8px gap between elements and a 1px divider between the zoom pair
// and the pan arrow. The cluster's height and bottom-edge anchoring derive
// from these.
const BUTTON_SIZE = 40;
const CLUSTER_GAP = 8;
const DIVIDER_HEIGHT = 1;
const EDGE_INSET = 8;

/**
 * Floating grid-navigation controls for the dashboard's wide grids: the zoom
 * in/out pair and the horizontal pan arrows, presented as one right-edge
 * control cluster (the familiar map convention) plus a single left-edge pan
 * arrow. Served by the Day/Week (H) **timeline** zoom (slotZoom.ts) and by
 * the Month grid's fit-width zoom (monthZoom.ts) — the caller passes its own
 * level range via `zoomMin`/`zoomMax`, since the two use different level sets.
 *
 * Why one cluster: a timeline zoom is expected beside the pan controls, not as
 * a second floating widget competing for the right edge, and a single stacked
 * widget (zoom +/−, a divider, then the right pan arrow) can never overlap
 * itself. The left pan arrow stays edge-anchored on the left so "scroll left"
 * still reads from the left edge; the right edge hosts the zoom pair and the
 * right pan arrow together. The cluster hangs from its bottom edge so the
 * right pan arrow's center lands on the grid's visible-slice center —
 * vertically aligned with the left pan arrow — and the zoom pair's slot above
 * it does not depend on `canScrollRight`, so nothing shifts when the arrow
 * appears or disappears while panning. The zoom pair renders whenever the grid
 * is shown (zoom is useful even when it fits without overflowing); the pan
 * arrows render only when that edge can scroll. Subdued circular grey with
 * filled triangles: intentionally lighter than the date-nav chevrons so the
 * controls read as secondary chrome.
 *
 * The controls are `position: fixed` and their anchor is measured **once** when
 * the view loads (and re-measured only on window resize or anchor size change)
 * — never per scroll frame. There is no scroll listener, so the controls hold
 * perfectly still at the calendar's visible-area center while the page scrolls.
 * (Tracking the visible slice on scroll moved the buttons with the calendar —
 * on grids shorter than the viewport they travelled toward the screen edge and
 * stuttered as the browser coalesced scroll frames; a pure-CSS sticky rail
 * instead pinned them to the grid's own box, so they rode out of view with it.)
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
}) {
  const canZoomIn = zoom < zoomMax;
  const canZoomOut = zoom > zoomMin;

  // Static anchor: the visible-slice center/bounds plus the 8px edge insets,
  // measured once (null before first paint so the controls never flash
  // unanchored).
  const [pos, setPos] = useState<{
    center: number;
    left: number;
    right: number;
    visibleTop: number;
    visibleBottom: number;
  } | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      // The visible slice is the anchor's rect clamped to the window. If the
      // anchor is entirely off-screen at measurement time, fall back to the
      // full viewport so the controls still render somewhere sensible.
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, window.innerHeight);
      const onScreen = visibleTop < visibleBottom;
      // 8px inside each grid edge; clamp to half the viewport so a very
      // narrow grid can't push the controls off-screen or onto each other.
      setPos({
        center: onScreen ? (visibleTop + visibleBottom) / 2 : window.innerHeight / 2,
        left: Math.min(rect.left + EDGE_INSET, window.innerWidth / 2),
        right: Math.min(window.innerWidth - rect.right + EDGE_INSET, window.innerWidth / 2),
        visibleTop: onScreen ? visibleTop : 0,
        visibleBottom: onScreen ? visibleBottom : window.innerHeight,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [anchorRef]);

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

  // Right-edge control cluster, anchored by its bottom edge (`top` +
  // translateY(-100%) pins the bottom) so the right pan arrow's center — the
  // bottom BUTTON_SIZE of the cluster — lands on the grid's visible-slice
  // center, vertically aligned with the left pan arrow; the zoom pair's slot
  // above stays fixed whether or not the arrow currently renders, so panning
  // never shifts it. Keep the widget on the grid's visible slice: clamp the
  // bottom edge so the pan arrow stays inside it; on strips shorter than the
  // cluster the zoom pair overflows above rather than pushing the arrow out
  // the bottom.
  const clusterHeight =
    BUTTON_SIZE * (canScrollRight ? 3 : 2) +
    CLUSTER_GAP * (canScrollRight ? 3 : 1) +
    (canScrollRight ? DIVIDER_HEIGHT : 0);
  const desiredBottom = canScrollRight
    ? pos.center + BUTTON_SIZE / 2
    : pos.center - (BUTTON_SIZE / 2 + CLUSTER_GAP + DIVIDER_HEIGHT + CLUSTER_GAP);
  const clusterBottom = Math.min(
    Math.max(desiredBottom, pos.visibleTop + clusterHeight),
    pos.visibleBottom,
  );

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
          top: clusterBottom,
          right: pos.right,
          transform: "translateY(-100%)",
          zIndex: 30,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: CLUSTER_GAP,
          width: BUTTON_SIZE,
        }}
      >
        <ActionIcon
          size={BUTTON_SIZE}
          radius="50%"
          variant="filled"
          color="gray"
          styles={buttonStyles}
          aria-label="Zoom in"
          disabled={!canZoomIn}
          onClick={onZoomIn}
        >
          <IconZoomIn size={18} />
        </ActionIcon>
        <ActionIcon
          size={BUTTON_SIZE}
          radius="50%"
          variant="filled"
          color="gray"
          styles={buttonStyles}
          aria-label="Zoom out"
          disabled={!canZoomOut}
          onClick={onZoomOut}
        >
          <IconZoomOut size={18} />
        </ActionIcon>
        {canScrollRight && (
          <>
            <Box
              style={{
                width: 24,
                height: DIVIDER_HEIGHT,
                borderRadius: 1,
                backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-5) 60%, transparent)",
              }}
            />
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
          </>
        )}
      </Box>
    </>
  );
}