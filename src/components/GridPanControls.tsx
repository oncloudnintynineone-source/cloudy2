"use client";

import { type CSSProperties, type RefObject, useEffect, useState } from "react";
import { ActionIcon } from "@mantine/core";
import { IconTriangleFilled } from "@tabler/icons-react";

/**
 * Floating pan buttons for the dashboard's wide grids (Day/Week (H) schedule
 * views, Week (D)): one per edge that can still scroll, positioned just
 * inside the grid's own left/right edges (the anchor box) rather than the
 * window's — the desktop sidebar sits left of the grid, so a window-left
 * button would overlap it — and vertically centered on the grid's *visible*
 * area (the part of its on-screen rect currently inside the window), not the
 * window's mid-height: the grid sits below the sticky date-nav and Week (D)
 * is taller than the viewport, so the window center misses it. The anchor
 * rect is re-measured on resize and on page scroll/resize (sidebar collapse,
 * immersive mode, window resizes and vertical scrolling all change the
 * visible slice). Hidden entirely when the grid is scrolled out of view.
 * Always visible whenever the grid overflows otherwise, at any breakpoint —
 * drag-to-pan and the buttons are the discoverable horizontal affordance on
 * both desktop and mobile. Subdued circular grey with filled triangles:
 * intentionally lighter than the date-nav chevrons and the prior brand-filled
 * arrows so the control reads as secondary chrome.
 */
export function GridPanControls({
  anchorRef,
  canScrollLeft,
  canScrollRight,
  onPan,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  onPan: (edge: "start" | "end") => void;
}) {
  // Measured 8px-inset offsets from the grid edges plus the vertical center
  // of the grid's visible slice (null before first paint or while the grid
  // is scrolled out of view; the effect measures synchronously on mount so
  // this never renders with stale geometry).
  const [offsets, setOffsets] = useState<{ left: number; right: number; top: number } | null>(
    null,
  );

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
          top: (visibleTop + visibleBottom) / 2,
        };
        // Scroll/resize fire every frame; skip the re-render when nothing
        // moved.
        if (
          prev &&
          prev.left === next.left &&
          prev.right === next.right &&
          prev.top === next.top
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

  if (!offsets || (!canScrollLeft && !canScrollRight)) {
    return null;
  }

  const baseStyle: CSSProperties = {
    position: "fixed",
    top: offsets.top,
    transform: "translateY(-50%)",
    // Below the sticky date-nav chrome (50) and the modals; above the grids'
    // internal stickies (<= 20).
    zIndex: 30,
  };

  return (
    <>
      {canScrollLeft && (
        <ActionIcon
          style={{ ...baseStyle, left: offsets.left }}
          size={40}
          radius="50%"
          variant="filled"
          color="gray"
          styles={{
            root: {
              backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 50%, transparent)",
              "&:where([data-disabled])": {
                backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 50%, transparent)",
              },
              "&:where(:hover)": {
                backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 60%, transparent)",
              },
            },
          }}
          aria-label="Scroll grid left"
          onClick={() => onPan("start")}
        >
          <IconTriangleFilled size={14} style={{ transform: "rotate(-90deg)" }} />
        </ActionIcon>
      )}
      {canScrollRight && (
        <ActionIcon
          style={{ ...baseStyle, right: offsets.right }}
          size={40}
          radius="50%"
          variant="filled"
          color="gray"
          styles={{
            root: {
              backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 50%, transparent)",
              "&:where([data-disabled])": {
                backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 50%, transparent)",
              },
              "&:where(:hover)": {
                backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 60%, transparent)",
              },
            },
          }}
          aria-label="Scroll grid right"
          onClick={() => onPan("end")}
        >
          <IconTriangleFilled size={14} style={{ transform: "rotate(90deg)" }} />
        </ActionIcon>
      )}
    </>
  );
}
