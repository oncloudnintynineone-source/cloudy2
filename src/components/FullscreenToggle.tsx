"use client";

import { type RefObject, useLayoutEffect, useState } from "react";
import { ActionIcon } from "@mantine/core";
import { IconArrowsMaximize, IconArrowsMinimize } from "@tabler/icons-react";

/**
 * Toggle geometry, shared with views that must keep their own chrome clear of
 * the floating button (the Month & Agenda pane header reserves this box so its
 * day chevrons stay tappable). Button diameter + the inset from the sticky
 * chrome's bottom edge and the grid's right edge.
 */
export const FULLSCREEN_BUTTON_SIZE = 40;
export const FULLSCREEN_EDGE_INSET = 8;

/**
 * Floating fullscreen (immersive-mode) toggle for the calendar page. Moved out
 * of the old kebab menu: it now anchors to the top-right of the calendar view,
 * beside the zoom/pan controls. `position: fixed` like `GridNavControls`, with
 * the top measured from the sticky date-nav chrome (so it always sits just
 * below it, never hidden underneath while scrolled) and the right inset from
 * the grid box (so it tracks the desktop sidebar). Circular, subdued grey —
 * the same secondary-chrome treatment as the zoom/pan cluster.
 *
 * Unlike the zoom/pan controls, this button is never gated on grid content: it
 * must stay reachable in every view (and in immersive mode it is the in-page
 * exit path, so it re-measures when `active` flips and the header collapses).
 */
export function FullscreenToggle({
  anchorRef,
  chromeRef,
  active,
  onToggle,
  layoutKey,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  chromeRef: RefObject<HTMLDivElement | null>;
  active: boolean;
  onToggle: () => void;
  /**
   * Layout identity the fixed position depends on (the caller passes its
   * breakpoint/chrome measurement). When it changes the anchors are
   * re-measured after commit, so a desktop↔mobile flip re-anchors the button
   * instead of leaving it at the previous layout's offsets.
   */
  layoutKey?: string | number | boolean;
}) {
  // Static anchor: the chrome's bottom edge (top) and the grid's right edge,
  // measured on load (null before first paint so the button never flashes
  // unanchored) and re-measured on resize / anchor-or-chrome size change /
  // immersive toggle / `layoutKey` flip, plus a one-shot post-mount settle
  // pass (next frame + webfonts) for the cold-load layout shift.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    // Read the anchors fresh on every pass (never close over the mount-time
    // nodes): a remounted anchor/chrome must be re-measured, not the detached
    // ones.
    const measure = () => {
      const anchor = anchorRef.current;
      const chrome = chromeRef.current;
      if (!anchor || !chrome) {
        return;
      }
      const gridRect = anchor.getBoundingClientRect();
      const chromeRect = chrome.getBoundingClientRect();
      setPos({
        // 8px below the sticky chrome, so the button never slides beneath it
        // while the grid scrolls.
        top: chromeRect.bottom + FULLSCREEN_EDGE_INSET,
        // 8px inside the grid's right edge; clamp to half the viewport so a
        // very narrow grid can't push the button off-screen.
        right: Math.min(
          window.innerWidth - gridRect.right + FULLSCREEN_EDGE_INSET,
          window.innerWidth / 2,
        ),
      });
    };
    measure();
    // Cold-load settle: the anchors' final boxes are not always laid out when
    // the first pass runs, and the settle can be a position/overflow change the
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
    const chrome = chromeRef.current;
    if (anchor) {
      observer.observe(anchor);
      if (anchor.parentElement) {
        observer.observe(anchor.parentElement);
      }
    }
    if (chrome) {
      observer.observe(chrome);
      if (chrome.parentElement) {
        observer.observe(chrome.parentElement);
      }
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [anchorRef, chromeRef, active, layoutKey]);

  if (!pos) {
    return null;
  }

  const buttonStyles = {
    root: {
      backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 50%, transparent)",
      "&:where(:hover)": {
        backgroundColor: "color-mix(in srgb, var(--mantine-color-gray-filled) 60%, transparent)",
      },
    },
  } as const;

  return (
    <ActionIcon
      style={{
        position: "fixed",
        top: pos.top,
        right: pos.right,
        // Above the pinned weekday/ruler strips (45) so the button never hides
        // behind them, but below the sticky date-nav chrome (50) and the
        // modals.
        zIndex: 46,
      }}
      size={FULLSCREEN_BUTTON_SIZE}
      radius="50%"
      variant="filled"
      color="gray"
      styles={buttonStyles}
      aria-label={active ? "Exit fullscreen" : "Enter fullscreen"}
      title={active ? "Exit fullscreen" : "Enter fullscreen"}
      onClick={onToggle}
    >
      {active ? <IconArrowsMinimize size={18} /> : <IconArrowsMaximize size={18} />}
    </ActionIcon>
  );
}
