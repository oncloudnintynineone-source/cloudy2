"use client";

import { type RefObject, useEffect, useRef } from "react";
import { ActionIcon, Box } from "@mantine/core";
import { IconTriangleFilled, IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import { MAX_ZOOM, MIN_ZOOM, type SlotZoom } from "@/lib/ui/slotZoom";

// Shared geometry for the edge controls: 40px round buttons; inside the right
// cluster an 8px gap between elements and a 1px divider between the zoom pair
// and the pan arrow. The cluster's height and bottom-edge anchoring derive
// from these.
const BUTTON_SIZE = 40;
const CLUSTER_GAP = 8;
const DIVIDER_HEIGHT = 1;
const EDGE_INSET = 8;

/**
 * Floating grid-navigation controls for the dashboard's wide schedules
 * (Day / Week (H)): the timeline zoom in/out pair and the horizontal pan
 * arrows, presented as one right-edge control cluster (the familiar map
 * convention) plus a single left-edge pan arrow.
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
 * Positioning: the controls are `position: fixed` and follow the grid's
 * visible slice through a `requestAnimationFrame`-throttled scroll handler
 * that writes `top`/`left`/`right` **directly to the DOM** (element refs) —
 * never through React state. The rAF callback runs in the same frame as the
 * scroll (before paint), so the controls track the visible-slice center in
 * lockstep with the content. (Applying the same measurement through a React
 * state update scheduled it a frame later, which made the buttons visibly
 * wobble while scrolling; a pure-CSS sticky rail instead pinned the controls
 * to the grid's own box, so they rode out of view with it near the grid's
 * edges.) Only the `hidden`/reveal flip touches React, and it fires only at
 * the discrete scroll-extreme boundaries.
 */
export function GridNavControls({
  anchorRef,
  canScrollLeft,
  canScrollRight,
  onPan,
  zoom,
  onZoomIn,
  onZoomOut,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  onPan: (edge: "start" | "end") => void;
  zoom: SlotZoom;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const canZoomIn = zoom < MAX_ZOOM;
  const canZoomOut = zoom > MIN_ZOOM;

  // Wrapper toggles visibility; the buttons are `position: fixed` children
  // positioned by the effect below. The cluster always renders so its ref
  // stays mounted; the left arrow is conditional (its ref is written only
  // while it exists, and the effect re-runs when it mounts).
  const rootRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLButtonElement | null>(null);
  const clusterRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    let raf = 0;
    const apply = () => {
      raf = 0;
      const rect = anchor.getBoundingClientRect();
      // The controls are fixed while the anchor scrolls with the page, so the
      // visible slice is the anchor's rect clamped to the window: when the
      // grid is shorter than the viewport that is the grid itself, when it is
      // taller (Day/Week (H) with many resources) it is the on-screen strip.
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, window.innerHeight);
      const outOfView = visibleTop >= visibleBottom;
      if (rootRef.current) {
        rootRef.current.style.visibility = outOfView ? "hidden" : "visible";
      }
      if (outOfView) {
        return;
      }
      const center = (visibleTop + visibleBottom) / 2;
      // 8px inside each grid edge; clamp to half the viewport so a very
      // narrow grid can't push the controls off-screen or onto each other.
      const left = Math.min(rect.left + EDGE_INSET, window.innerWidth / 2);
      const right = Math.min(window.innerWidth - rect.right + EDGE_INSET, window.innerWidth / 2);
      if (leftRef.current) {
        leftRef.current.style.top = `${center}px`;
        leftRef.current.style.left = `${left}px`;
      }
      // Right-edge control cluster, anchored by its bottom edge (`top` +
      // translateY(-100%) pins the bottom) so the right pan arrow's center —
      // the bottom BUTTON_SIZE of the cluster — lands on the grid's
      // visible-slice center, vertically aligned with the left pan arrow; the
      // zoom pair's slot above stays fixed whether or not the arrow currently
      // renders, so panning never shifts it. Keep the widget on the grid's
      // visible slice: clamp the bottom edge so the pan arrow stays inside it;
      // on strips shorter than the cluster the zoom pair overflows above
      // rather than pushing the arrow out the bottom.
      const clusterHeight =
        BUTTON_SIZE * (canScrollRight ? 3 : 2) +
        CLUSTER_GAP * (canScrollRight ? 3 : 1) +
        (canScrollRight ? DIVIDER_HEIGHT : 0);
      const desiredBottom = canScrollRight
        ? center + BUTTON_SIZE / 2
        : center - (BUTTON_SIZE / 2 + CLUSTER_GAP + DIVIDER_HEIGHT + CLUSTER_GAP);
      const clusterBottom = Math.min(
        Math.max(desiredBottom, visibleTop + clusterHeight),
        visibleBottom,
      );
      if (clusterRef.current) {
        clusterRef.current.style.top = `${clusterBottom}px`;
        clusterRef.current.style.right = `${right}px`;
      }
    };
    // Coalesce per-frame scroll/resize bursts into one apply per rAF.
    const schedule = () => {
      if (!raf) {
        raf = requestAnimationFrame(apply);
      }
    };
    apply();
    const observer = new ResizeObserver(schedule);
    observer.observe(anchor);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [anchorRef, canScrollLeft, canScrollRight]);

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

  return (
    <Box component="div" ref={rootRef} style={{ visibility: "hidden" }}>
      {canScrollLeft && (
        <ActionIcon
          ref={leftRef}
          style={{
            position: "fixed",
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
        ref={clusterRef}
        role="group"
        aria-label="Grid navigation"
        style={{
          position: "fixed",
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
    </Box>
  );
}