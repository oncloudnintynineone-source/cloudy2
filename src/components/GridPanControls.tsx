"use client";

import { type RefObject, useEffect, useState } from "react";
import { ActionIcon } from "@mantine/core";
import { IconTriangleFilled } from "@tabler/icons-react";

const BUTTON_SIZE = 40;
const EDGE_INSET = 8;

/**
 * Floating pan buttons for the dashboard's wide grids (Day/Week (H) schedule
 * views, Week (D)): one per edge that can still scroll, positioned just
 * inside the grid's own left/right edges (the anchor box) rather than the
 * window's — the desktop sidebar sits left of the grid, so a window-left
 * button would overlap it — and vertically centered on the grid's *visible*
 * area (the part of its on-screen rect currently inside the window), not the
 * window's mid-height: the grid sits below the sticky date-nav and can be
 * taller than the viewport, so the window center misses it. Always visible
 * whenever the grid overflows, at any breakpoint — drag-to-pan and the
 * buttons are the discoverable horizontal affordance on both desktop and
 * mobile. Subdued circular grey with filled triangles: intentionally lighter
 * than the date-nav chevrons and the prior brand-filled arrows so the control
 * reads as secondary chrome.
 *
 * The buttons are `position: fixed` and their anchor is measured **once** when
 * the view loads (and re-measured only on window resize or anchor size change)
 * — never per scroll frame. There is no scroll listener, so the buttons hold
 * perfectly still at the calendar's visible-area center while the page scrolls.
 * (Tracking the visible slice on scroll moved the buttons with the calendar —
 * on grids shorter than the viewport they travelled toward the screen edge and
 * stuttered as the browser coalesced scroll frames; a pure-CSS sticky rail
 * instead pinned them to the grid's own box, so they rode out of view with it.)
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
  // Static anchor: the visible-slice center plus the 8px edge insets, measured
  // once (null before first paint so the buttons never flash unanchored).
  const [pos, setPos] = useState<{ center: number; left: number; right: number } | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      // The visible slice is the anchor's rect clamped to the window. If the
      // anchor is entirely off-screen at measurement time, fall back to the
      // viewport center so the buttons still render somewhere sensible.
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, window.innerHeight);
      const onScreen = visibleTop < visibleBottom;
      // 8px inside each grid edge; clamp to half the viewport so a very
      // narrow grid can't push the buttons off-screen or onto each other.
      setPos({
        center: onScreen ? (visibleTop + visibleBottom) / 2 : window.innerHeight / 2,
        left: Math.min(rect.left + EDGE_INSET, window.innerWidth / 2),
        right: Math.min(window.innerWidth - rect.right + EDGE_INSET, window.innerWidth / 2),
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

  if (!pos || (!canScrollLeft && !canScrollRight)) {
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
      {canScrollRight && (
        <ActionIcon
          style={{
            position: "fixed",
            top: pos.center,
            right: pos.right,
            transform: "translateY(-50%)",
            zIndex: 30,
          }}
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
      )}
    </>
  );
}