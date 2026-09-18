/**
 * Timeline zoom for the Day / Week (H) schedule views, plus the two horizontal
 * zooms for the Week (Grid) view and the Week (D) matrix. One shared zoom level
 * scales each hour slot's **width** on the resource views (they read it from a
 * CSS variable — `--resources-*-view-slot-width` — and size every event as a
 * percentage of the day container that variable defines, so changing the var
 * re-lays out slots and events alike). The Week (Grid) view is a conventional
 * 7-column week grid with **two independent** zoom levels — one for the
 * day-column **width** (`gridWeekColumnWidth`, floored at fit so columns never
 * shrink below the viewport) and one for the hour-slot **height**
 * (`gridWeekSlotHeight`), so the events can be grown in either direction on its
 * own. The Week (D) matrix has a single horizontal zoom over an absolute px floor
 * (`weekMatrixDayMinPx`). Each level is remembered per device in the UI-state
 * cookie (see uiState.ts) and is NOT URL-backed — zooming never navigates.
 *
 * The helpers here are pure (no I/O, no React) so the geometry math and the
 * level stepping are unit-tested without a DOM.
 */

/** Discrete zoom levels, smallest to largest. 1 = the default slot widths. */
export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6] as const;
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
// Week (Grid) hour-slot height at zoom 1 (3.5rem = 56px, matching the other
// schedule views' `rowHeight`).
const GRID_WEEK_BASE_REM = 3.5;

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

/** Smallest column-zoom level: the fit-to-width baseline (never below it). */
export const MIN_COLUMN_ZOOM = 1;

/**
 * Week (Grid) column-zoom default: 2× the fit-to-width columns (each day column
 * spans twice the viewport-seventh, so about three and a half days fit on
 * screen and the grid pans). It is NOT the level floor — `MIN_COLUMN_ZOOM`
 * (fit) still bounds zoom-out; this only seeds the level when the device
 * cookie carries none.
 */
export const GRID_WEEK_COL_ZOOM_DEFAULT = 2;

/**
 * Coerce a remembered Week (Grid) **column** zoom. Same snapping as
 * `clampZoom`, but floored at the fit level: columns must never shrink below
 * the viewport width (that would leave empty space beside the grid), so an
 * out-of-range/legacy value (e.g. the old two-axis `gridWeekZoom` of `0.5`)
 * resolves to `1`. Returns `null` for junk so the caller falls back.
 */
export function clampGridWeekColZoom(raw: unknown): SlotZoom | null {
  const level = clampZoom(raw);
  return level === null ? null : (Math.max(MIN_COLUMN_ZOOM, level) as SlotZoom);
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

/**
 * Week (Grid) hour-slot height (the vertical half of its two-axis zoom — see
 * `gridWeekColumnWidth` for the horizontal half). Same base at every
 * breakpoint. Unlike the horizontal widths, the multiplier is not baked into
 * the expression: it rides a CSS custom property (`zoomVar`, published on the
 * canvas wrapper) so the row zoom can be animated by writing that var each frame
 * without re-rendering the grid (Mantine sizes every slot from the resulting
 * `--week-view-slot-height`, and its event positions are percentage-based).
 */
export function gridWeekSlotHeight(zoomVar: string): string {
  return `calc(${GRID_WEEK_BASE_REM}rem * var(--mantine-scale) * ${zoomVar})`;
}

/**
 * Week (Grid) day-column width multiplier for a zoom level, as a percentage of
 * the fit-to-width grid (the day header, all-day rows and column rows all take
 * this width, so they stay aligned while the grid overflows into the horizontal
 * pan). Floored at `1`: zooming out only compacts the hour rows — the columns
 * never shrink below the viewport width (which would leave empty space beside
 * the grid).
 */
export function gridWeekColumnWidth(zoom: SlotZoom): string {
  return `${Math.max(1, zoom) * 100}%`;
}

/**
 * Week (D) day-column minimum width in pixels at zoom 1. The matrix's seven
 * columns are `minmax(<min>, 1fr)`, so on a wide screen they stretch to fill the
 * viewport and on a narrow one they overflow into the horizontal pan.
 */
export const WEEK_MATRIX_DAY_MIN_PX = 112;

/**
 * Week (D) day-column minimum width for a zoom level, in px. Unlike the Week
 * (Grid) column zoom (a percentage of the fit-to-width grid), the matrix's base
 * is an absolute px floor, so its zoom scales that floor and floors at `1` (the
 * fit level) — zooming out never makes the columns narrower than the default
 * readable width. The view multiplies this into its `minmax(...)` template and
 * its scroll-content min-width together, so the day columns and their header
 * stay aligned while the grid overflows.
 */
export function weekMatrixDayMinPx(zoom: SlotZoom): number {
  return Math.max(1, zoom) * WEEK_MATRIX_DAY_MIN_PX;
}
