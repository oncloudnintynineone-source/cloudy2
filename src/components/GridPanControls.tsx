"use client";

import { type RefObject, useEffect, useRef } from "react";
import { ActionIcon, Box } from "@mantine/core";
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
 * taller than the viewport, so the window center misses it. Hidden entirely
 * when the grid is scrolled out of view. Always visible whenever the grid
 * overflows otherwise, at any breakpoint — drag-to-pan and the buttons are
 * the discoverable horizontal affordance on both desktop and mobile. Subdued
 * circular grey with filled triangles: intentionally lighter than the
 * date-nav chevrons and the prior brand-filled arrows so the control reads as
 * secondary chrome.
 *
 * Positioning: the buttons are `position: fixed` and follow the grid's
 * visible slice through a `requestAnimationFrame`-throttled scroll handler
 * that writes `top`/`left`/`right` **directly to the DOM** (element refs) —
 * never through React state. The rAF callback runs in the same frame as the
 * scroll (before paint), so the buttons track the visible-slice center in
 * lockstep with the content. (Applying the same measurement through a React
 * state update scheduled it a frame later, which made the buttons visibly
 * wobble while scrolling; a pure-CSS sticky rail instead pinned the buttons
 * to the grid's own box, so they rode out of view with it near the grid's
 * edges.) Only the `hidden`/reveal flip touches React, and it fires only at
 * the discrete scroll-extreme boundaries.
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
  // Wrapper toggles visibility; the buttons are `position: fixed` children
  // positioned by the effect below. Each arrow renders only while its edge can
  // scroll; the effect re-runs on those flips (deps) so a freshly-mounted
  // arrow gets positioned, and the whole component unmounts when neither edge
  // can scroll.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLButtonElement | null>(null);
  const rightRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    let raf = 0;
    const apply = () => {
      raf = 0;
      const rect = anchor.getBoundingClientRect();
      // The buttons are fixed while the anchor scrolls with the page, so the
      // visible slice is the anchor's rect clamped to the window: when the
      // grid is shorter than the viewport that is the grid itself, when it
      // is taller (Week (D)) it is the on-screen strip.
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
      // narrow grid can't push the buttons off-screen or onto each other.
      const left = Math.min(rect.left + EDGE_INSET, window.innerWidth / 2);
      const right = Math.min(window.innerWidth - rect.right + EDGE_INSET, window.innerWidth / 2);
      if (leftRef.current) {
        leftRef.current.style.top = `${center}px`;
        leftRef.current.style.left = `${left}px`;
      }
      if (rightRef.current) {
        rightRef.current.style.top = `${center}px`;
        rightRef.current.style.right = `${right}px`;
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

  if (!canScrollLeft && !canScrollRight) {
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
      {canScrollRight && (
        <ActionIcon
          ref={rightRef}
          style={{
            position: "fixed",
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
    </Box>
  );
}