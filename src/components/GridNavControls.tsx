"use client";

import { type CSSProperties, type RefObject, useEffect, useState } from "react";
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
 * appears or disappears while panning.
 *
 * Like the original GridPanControls the buttons are `position: fixed` and
 * track the grid's *visible* slice (the part of the anchor's on-screen rect
 * inside the window), re-measured on resize and page scroll/resize — the
 * desktop sidebar sits left of the grid, and the grid sits below the sticky
 * date-nav and can be taller than the viewport, so the window center misses
 * it. They disappear when the grid is scrolled out of view. The zoom pair
 * renders whenever the grid is shown (zoom is useful even when it fits
 * without overflowing); the pan arrows render only when that edge can scroll.
 * Subdued circular grey with filled triangles: intentionally lighter than the
 * date-nav chevrons so the controls read as secondary chrome.
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
  // Measured 8px-inset offsets from the grid edges plus the vertical center
  // and bounds of the grid's visible slice (null before first paint or while
  // the grid is scrolled out of view; the effect measures synchronously on
  // mount so this never renders with stale geometry).
  const [offsets, setOffsets] = useState<{
    left: number;
    right: number;
    center: number;
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
      // The buttons are fixed while the anchor scrolls with the page, so the
      // visible slice is the anchor's rect clamped to the window: when the
      // grid is shorter than the viewport that is the grid itself, when it
      // is taller (Week (D)) it is the on-screen strip.
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, window.innerHeight);
      setOffsets((prev) => {
        if (visibleTop >= visibleBottom) {
          return prev === null ? prev : null;
        }
        const next = {
          // 8px inside each grid edge; clamp to half the viewport so a very
          // narrow grid can't push the buttons off-screen or onto each other.
          left: Math.min(rect.left + 8, window.innerWidth / 2),
          right: Math.min(window.innerWidth - rect.right + 8, window.innerWidth / 2),
          center: (visibleTop + visibleBottom) / 2,
          visibleTop,
          visibleBottom,
        };
        // Scroll/resize fire every frame; skip the re-render when nothing moved.
        if (
          prev &&
          prev.left === next.left &&
          prev.right === next.right &&
          prev.center === next.center &&
          prev.visibleTop === next.visibleTop &&
          prev.visibleBottom === next.visibleBottom
        ) {
          return prev;
        }
        return next;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [anchorRef]);

  if (!offsets) {
    return null;
  }

  const canZoomIn = zoom < MAX_ZOOM;
  const canZoomOut = zoom > MIN_ZOOM;

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

  // Left-edge pan arrow (edge-anchored so "scroll left" reads from the left).
  const leftBaseStyle: CSSProperties = {
    position: "fixed",
    top: offsets.center,
    left: offsets.left,
    transform: "translateY(-50%)",
    // Below the sticky date-nav chrome (50) and the modals; above the grids'
    // internal stickies (<= 20).
    zIndex: 30,
  };

  // Right-edge control cluster: zoom +/− on top, a divider, then the right pan
  // arrow. Anchored by its bottom edge (`top` + translateY(-100%) pins the
  // bottom) so the arrow's center — the bottom BUTTON_SIZE of the cluster —
  // lands on the grid's visible-slice center, vertically aligned with the
  // left pan arrow; the zoom pair's slot above stays fixed whether or not the
  // arrow currently renders, so panning never shifts it.
  const clusterHeight =
    BUTTON_SIZE * (canScrollRight ? 3 : 2) +
    CLUSTER_GAP * (canScrollRight ? 3 : 1) +
    (canScrollRight ? DIVIDER_HEIGHT : 0);
  const desiredBottom = canScrollRight
    ? offsets.center + BUTTON_SIZE / 2
    : offsets.center - (BUTTON_SIZE / 2 + CLUSTER_GAP + DIVIDER_HEIGHT + CLUSTER_GAP);
  // Keep the widget on the grid's visible slice: clamp the bottom edge so the
  // pan arrow stays inside it; on strips shorter than the cluster the zoom
  // pair overflows above rather than pushing the arrow out the bottom.
  const clusterBottom = Math.min(
    Math.max(desiredBottom, offsets.visibleTop + clusterHeight),
    offsets.visibleBottom,
  );
  const clusterStyle: CSSProperties = {
    position: "fixed",
    top: clusterBottom,
    right: offsets.right,
    transform: "translateY(-100%)",
    zIndex: 30,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: CLUSTER_GAP,
    width: BUTTON_SIZE,
  };

  return (
    <>
      {canScrollLeft && (
        <ActionIcon
          style={leftBaseStyle}
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

      <Box component="div" role="group" aria-label="Grid navigation" style={clusterStyle}>
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
