"use client";

import { type CSSProperties, type RefObject, useEffect, useState } from "react";
import { ActionIcon, Box } from "@mantine/core";
import { IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import { MAX_ZOOM, MIN_ZOOM, type SlotZoom } from "@/lib/ui/slotZoom";

// The pair's total height (two 40px buttons + 8px gap) and half of it, used to
// keep the stack inside the grid's visible slice.
const PAIR_HEIGHT = 88;
const PAIR_HALF = PAIR_HEIGHT / 2;

/**
 * Floating zoom-in / zoom-out buttons for the Day / Week (H) schedule grids.
 * They scale each hour column's width (see src/lib/ui/slotZoom.ts) so the user
 * can fit more of the day/week in view or expand it for detail. A vertical
 * pair (zoom-in on top, the familiar map convention) anchored just inside the
 * grid's right edge, below the vertically-centered right pan button, so the
 * two read as one cluster of secondary chrome and never overlap.
 *
 * Like GridPanControls it is `position: fixed` and tracks the grid's *visible*
 * slice (the part of the anchor's on-screen rect inside the window), re-measured
 * on resize and page scroll, so it stays parked on the grid as the page scrolls
 * and disappears when the grid is scrolled out of view. Unlike the pan buttons
 * it renders whenever the grid is shown — zoom is useful even when the grid
 * fits without overflowing.
 */
export function GridZoomControls({
  anchorRef,
  zoom,
  onZoomIn,
  onZoomOut,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  zoom: SlotZoom;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  // Measured 8px-inset right offset plus the vertical center of the pair (null
  // before first paint or while the grid is scrolled out of view).
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      // The buttons are fixed while the anchor scrolls with the page, so the
      // visible slice is the anchor's rect clamped to the window.
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, window.innerHeight);
      setPos((prev) => {
        if (visibleTop >= visibleBottom) {
          return prev === null ? prev : null;
        }
        const visibleCenter = (visibleTop + visibleBottom) / 2;
        const visibleHeight = visibleBottom - visibleTop;
        const minCenter = visibleTop + PAIR_HALF;
        const maxCenter = visibleBottom - PAIR_HALF;
        // Default: 72% down the visible slice, i.e. below the centered right
        // pan button (its bottom edge is visibleCenter + 20). Keep a gap.
        let center = visibleTop + visibleHeight * 0.72;
        center = Math.max(center, visibleCenter + 20 + 8 + PAIR_HALF);
        if (maxCenter >= minCenter) {
          center = Math.min(center, maxCenter);
          center = Math.max(center, minCenter);
        } else {
          // Visible slice shorter than the pair: best effort, center it.
          center = visibleCenter;
        }
        const next = {
          // 8px inside the right grid edge, clamped to half the viewport so a
          // very narrow grid can't push the buttons off-screen.
          right: Math.min(window.innerWidth - rect.right + 8, window.innerWidth / 2),
          top: center,
        };
        // Scroll/resize fire every frame; skip the re-render when nothing moved.
        if (prev && prev.right === next.right && prev.top === next.top) {
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

  if (!pos) {
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

  const baseStyle: CSSProperties = {
    position: "fixed",
    top: pos.top,
    right: pos.right,
    transform: "translateY(-50%)",
    // Below the sticky date-nav chrome (50) and the modals; above the grids'
    // internal stickies (<= 20) — same band as the pan buttons.
    zIndex: 30,
  };

  return (
    <Box
      component="div"
      role="group"
      aria-label="Zoom timeline"
      style={{ ...baseStyle, width: 40 }}
    >
      <ActionIcon
        size={40}
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
        mt={8}
        size={40}
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
    </Box>
  );
}
