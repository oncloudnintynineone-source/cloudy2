"use client";

import { type RefObject, useEffect, useState } from "react";
import { ActionIcon } from "@mantine/core";
import { IconArrowsMaximize, IconArrowsMinimize } from "@tabler/icons-react";

const BUTTON_SIZE = 40;
const EDGE_INSET = 8;

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
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  chromeRef: RefObject<HTMLDivElement | null>;
  active: boolean;
  onToggle: () => void;
}) {
  // Static anchor: the chrome's bottom edge (top) and the grid's right edge,
  // measured once (null before first paint so the button never flashes
  // unanchored) and re-measured on resize / anchor-size change / immersive
  // toggle.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    const chrome = chromeRef.current;
    if (!anchor || !chrome) {
      return;
    }
    const measure = () => {
      const gridRect = anchor.getBoundingClientRect();
      const chromeRect = chrome.getBoundingClientRect();
      setPos({
        // 8px below the sticky chrome, so the button never slides beneath it
        // while the grid scrolls.
        top: chromeRect.bottom + EDGE_INSET,
        // 8px inside the grid's right edge; clamp to half the viewport so a
        // very narrow grid can't push the button off-screen.
        right: Math.min(window.innerWidth - gridRect.right + EDGE_INSET, window.innerWidth / 2),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    observer.observe(chrome);
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [anchorRef, chromeRef, active]);

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
        // Below the sticky date-nav chrome (50) and the modals; above the
        // grids' internal stickies (<= 20).
        zIndex: 30,
      }}
      size={BUTTON_SIZE}
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
