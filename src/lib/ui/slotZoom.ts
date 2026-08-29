/**
 * Timeline zoom for the Day / Week (H) schedule views. One shared zoom level
 * scales each hour slot's width: the views read their slot width from a CSS
 * variable (`--resources-*-view-slot-width`) and size every event as a
 * percentage of the day container that variable defines, so changing the var
 * re-lays out slots and events alike. The level is remembered per device in
 * the UI-state cookie (see uiState.ts) and is NOT URL-backed — zooming never
 * navigates.
 *
 * The helpers here are pure (no I/O, no React) so the width math and the
 * level stepping are unit-tested without a DOM.
 */

/** Discrete zoom levels, smallest to largest. 1 = the default slot widths. */
export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export type SlotZoom = (typeof ZOOM_LEVELS)[number];

export const MIN_ZOOM = ZOOM_LEVELS[0];
export const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

// Slot base widths in `rem` at zoom 1, matching what the views render today:
// the Week (H) hour slot is phone-tuned at 3.75rem (60px) and widened to
// 4.5rem (72px) at lg; the Day view keeps Mantine's 5rem (80px) default. The
// `--mantine-scale` multiplier is applied by the views (see the CSS-var
// gotcha in docs/desktop-responsive.md), so these are the bare rem figures.
const WEEK_MOBILE_BASE_REM = 3.75;
const WEEK_DESKTOP_BASE_REM = 4.5;
const DAY_BASE_REM = 5;

/**
 * Coerce an arbitrary decoded value (a remembered cookie `zoom`) into a zoom
 * level: a finite number snaps to the nearest level, anything else (absent,
 * non-numeric, non-finite) degrades to `null` so the caller falls back to the
 * default. A corrupted cookie must never break a render.
 */
export function clampZoom(raw: unknown): SlotZoom | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  let best: SlotZoom = MIN_ZOOM;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const level of ZOOM_LEVELS) {
    const distance = Math.abs(level - raw);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = level;
    }
  }
  return best;
}

/**
 * Step a zoom level one notch toward `dir` (+1 = zoom in, -1 = zoom out),
 * clamped at the extremes so the buttons disable rather than loop.
 */
export function stepZoom(zoom: SlotZoom, dir: 1 | -1): SlotZoom {
  const index = ZOOM_LEVELS.indexOf(zoom);
  const next = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, index + dir));
  return ZOOM_LEVELS[next];
}

function slotWidthCss(rem: number): string {
  // Round to 4dp to keep the CSS var free of float noise (e.g. 3.75 * 0.75).
  return `calc(${Number(rem.toFixed(4))}rem * var(--mantine-scale))`;
}

/** Week (H) hour-slot width for a zoom level and breakpoint. */
export function weekSlotWidth(zoom: SlotZoom, isDesktop: boolean): string {
  const base = isDesktop ? WEEK_DESKTOP_BASE_REM : WEEK_MOBILE_BASE_REM;
  return slotWidthCss(base * zoom);
}

/** Day-view hour-slot width for a zoom level (same base at every breakpoint). */
export function daySlotWidth(zoom: SlotZoom): string {
  return slotWidthCss(DAY_BASE_REM * zoom);
}
