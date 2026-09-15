/**
 * Month-grid zoom. Unlike the Day/Week (H) timeline zoom (slotZoom.ts), which
 * scales a fixed pixel slot width, the Month view's zoom is applied on top of
 * a **fit-to-width** base: at zoom 1 the grid's day columns are exactly 1/7 of
 * the viewport width (every day visible, no horizontal scroll on any screen);
 * zooming in multiplies that width so the columns widen and the grid overflows
 * into the horizontal pan the dashboard already has for its wide grids.
 *
 * The level is a pure multiplier ≥ 1 of the fit width — there is no level below
 * 1 because the grid can never be narrower than the viewport. It is remembered
 * per device in the UI-state cookie (`dashboard.monthZoom`, see uiState.ts) and
 * is NOT URL-backed — zooming never navigates.
 *
 * The helpers here are pure (no I/O, no React) so the level math is unit-tested
 * without a DOM.
 */

/** Discrete month zoom levels, smallest to largest. 1 = fit to viewport width. */
export const MONTH_ZOOM_LEVELS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6] as const;
export type MonthZoom = (typeof MONTH_ZOOM_LEVELS)[number];

export const MIN_MONTH_ZOOM = MONTH_ZOOM_LEVELS[0];
export const MAX_MONTH_ZOOM = MONTH_ZOOM_LEVELS[MONTH_ZOOM_LEVELS.length - 1];

/**
 * Coerce an arbitrary decoded value (a remembered cookie `monthZoom`) into a
 * zoom level: a finite number snaps to the nearest level, anything else
 * (absent, non-numeric, non-finite) degrades to `null` so the caller falls
 * back to the fit default. A corrupted cookie must never break a render.
 */
export function clampMonthZoom(raw: unknown): MonthZoom | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  let best: MonthZoom = MIN_MONTH_ZOOM;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const level of MONTH_ZOOM_LEVELS) {
    const distance = Math.abs(level - raw);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = level;
    }
  }
  return best;
}

/**
 * Step a month zoom level one notch toward `dir` (+1 = zoom in, -1 = zoom
 * out), clamped at the extremes so the buttons disable rather than loop. The
 * minimum level is the fit default (1) — zooming out stops there.
 */
export function stepMonthZoom(zoom: MonthZoom, dir: 1 | -1): MonthZoom {
  const index = MONTH_ZOOM_LEVELS.indexOf(zoom);
  const next = Math.min(MONTH_ZOOM_LEVELS.length - 1, Math.max(0, index + dir));
  return MONTH_ZOOM_LEVELS[next];
}
