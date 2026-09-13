/**
 * Dual Pane split ratio: the fraction of the pane row's width given to the
 * Month pane when the Dual Pane view is side by side (lg and up). It is a pure
 * layout number — the Agenda pane takes the remainder — so the whole range
 * math lives here, unit-tested without a DOM.
 *
 * The ratio is user-draggable (the split handle) and remembered per device in
 * the UI-state cookie (`dashboard.dualSplit`, see uiState.ts), exactly like the
 * timeline / Month zooms; it is NOT URL-backed and never navigates. Below `lg`
 * the panes stack vertically and the ratio is ignored.
 *
 * Clamped to a sane band so a pane can never be dragged to nothing (both panes
 * stay usable at every level).
 */

/** Default Month-pane fraction (60% month / 40% agenda). */
export const DUAL_SPLIT_DEFAULT = 0.6;
/** Smallest Month-pane fraction the handle can reach (Agenda keeps 75%). */
export const DUAL_SPLIT_MIN = 0.25;
/** Largest Month-pane fraction the handle can reach (Month keeps 75%). */
export const DUAL_SPLIT_MAX = 0.75;
/** One keyboard step of the split handle (arrow keys). */
export const DUAL_SPLIT_STEP = 0.05;

/** Round to 2 decimals so repeated stepping can't accumulate float drift. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Coerce an arbitrary decoded value (a remembered cookie `dualSplit`, or a
 * live drag fraction) into a usable ratio: a finite number is clamped to the
 * band, anything else (absent, non-numeric, non-finite) degrades to `null` so
 * the caller falls back to `DUAL_SPLIT_DEFAULT`. A corrupted cookie must never
 * break a render.
 */
export function clampDualSplit(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  return round(Math.min(DUAL_SPLIT_MAX, Math.max(DUAL_SPLIT_MIN, raw)));
}

/**
 * Step the split one notch toward `dir` (+1 = widen the Month pane, -1 =
 * shrink it), clamped at the band so the handle stops rather than looping.
 * Used by the handle's Left/Right arrow keys.
 */
export function stepDualSplit(value: number, dir: 1 | -1): number {
  const base = clampDualSplit(value) ?? DUAL_SPLIT_DEFAULT;
  return clampDualSplit(base + dir * DUAL_SPLIT_STEP) ?? DUAL_SPLIT_DEFAULT;
}
