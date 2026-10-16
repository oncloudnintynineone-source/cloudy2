"use client";

import { type CSSProperties, type RefObject, useLayoutEffect, useState } from "react";
import { ActionIcon, type ActionIconProps } from "@mantine/core";
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
 * The fullscreen (immersive-mode) button itself — icon + accessible label, no
 * positioning, so it drops into any chrome. Shared by the floating
 * `FullscreenToggle` (lg+ only, top-right of the grid) and the mobile bottom
 * control pill's inline fullscreen circle (below `lg`, where the floating
 * button is hidden); callers vary `size`/`variant`/`className` to match their
 * surroundings.
 */
export function FullscreenButton({
  active,
  onToggle,
  size = FULLSCREEN_BUTTON_SIZE,
  variant = "filled",
  color = "gray",
  className = "c2-glass-btn",
  style,
  visibleFrom,
}: {
  active: boolean;
  onToggle: () => void;
  size?: number | string;
  variant?: ActionIconProps["variant"];
  color?: ActionIconProps["color"];
  className?: string;
  style?: CSSProperties;
  /** Mantine responsive prop — e.g. `"lg"` to show only at lg+. */
  visibleFrom?: string;
}) {
  const label = active ? "Exit fullscreen" : "Enter fullscreen";
  return (
    <ActionIcon
      style={style}
      size={size}
      radius="50%"
      variant={variant}
      color={color}
      className={className}
      visibleFrom={visibleFrom}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      {active ? <IconArrowsMinimize size={18} /> : <IconArrowsMaximize size={18} />}
    </ActionIcon>
  );
}

/**
 * Floating fullscreen (immersive-mode) toggle for the calendar page at lg+.
 * Moved out of the old kebab menu: it anchors to the top-right of the calendar
 * view, beside the zoom/pan controls. `position: fixed` like `GridNavControls`,
 * with the top measured from the sticky date-nav chrome (so it always sits just
 * below it, never hidden underneath while scrolled) and the right inset from
 * the grid box (so it tracks the desktop sidebar). Circular, subdued grey —
 * the same secondary-chrome treatment as the zoom/pan cluster.
 *
 * Called with `visibleFrom="lg"` (below `lg` the mobile bottom control pill
 * carries its own `FullscreenButton` instead, and the thin top strip there is
 * too tight for a floating control). Unlike the zoom/pan controls, this button
 * is never gated on grid content: it must stay reachable in every view (and in
 * immersive mode, at lg+, it is the in-page exit path, so it re-measures when
 * `active` flips and the header collapses).
 */
export function FullscreenToggle({
  anchorRef,
  chromeRef,
  active,
  onToggle,
  layoutKey,
  visibleFrom,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  chromeRef: RefObject<HTMLDivElement | null>;
  active: boolean;
  onToggle: () => void;
  /**
   * Layout identity the fixed position depends on (the caller passes its
   * breakpoint/chrome measurement). When it changes the anchors are
   * re-measured after commit, so a desktop↔mobile flip re-anchors the button
   * instead of leaving them at the previous layout's offsets.
   */
  layoutKey?: string | number | boolean;
  /** Mantine responsive prop forwarded to the button (the dashboard passes
   *  `"lg"` so the floating toggle yields to the mobile pill below `lg`). */
  visibleFrom?: string;
}) {
  // Static anchor: the chrome's bottom edge (top) and the grid's right edge,
  // measured on load (null before first paint so the button never flashes
  // unanchored) and re-measured on resize / anchor-or-chrome size change /
  // immersive toggle / `layoutKey` flip.
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
        // 8px below the sticky top chrome (the full chrome at lg, the thin
        // view-name strip below `lg`), so the button never slides beneath it
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
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    const anchor = anchorRef.current;
    const chrome = chromeRef.current;
    if (anchor) {
      observer.observe(anchor);
    }
    if (chrome) {
      observer.observe(chrome);
    }
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [anchorRef, chromeRef, active, layoutKey]);

  if (!pos) {
    return null;
  }

  return (
    <FullscreenButton
      active={active}
      onToggle={onToggle}
      visibleFrom={visibleFrom}
      style={{
        position: "fixed",
        top: pos.top,
        right: pos.right,
        // Above the pinned weekday/ruler strips (45) so the button never hides
        // behind them, but below the sticky date-nav chrome (50) and the
        // modals.
        zIndex: 46,
      }}
    />
  );
}
