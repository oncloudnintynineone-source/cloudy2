/**
 * Bottom-sheet drag-to-dismiss math (docs/native-feel.md).
 *
 * The mobile bottom sheet (`ResponsiveSheet`) is dragged downward from its
 * handle; on release this module decides whether that drag dismisses the sheet
 * or springs it back. Kept pure and I/O-free so the thresholds are unit-tested
 * without a DOM or pointer events.
 *
 * Only downward movement can dismiss (an upward drag is resisted to 0), and a
 * fast flick dismisses even on a short travel — the same gesture language as a
 * native sheet.
 */

/** Minimum downward travel (px) that can dismiss, regardless of sheet height. */
export const SHEET_DISMISS_MIN_PX = 80;
/** Fraction of the sheet's own height that must be crossed to dismiss. */
export const SHEET_DISMISS_RATIO = 0.25;
/** Downward release velocity (px/ms) that dismisses on its own. */
export const SHEET_DISMISS_VELOCITY = 0.5;

/**
 * Downward offset to translate the sheet by during a drag: negative (upward)
 * movement is clamped to 0 so the sheet cannot be pulled above its resting
 * position.
 */
export function sheetDragOffset(movementY: number): number {
  return movementY > 0 ? movementY : 0;
}

export interface SheetDismissInput {
  /** Downward travel at release, already clamped via {@link sheetDragOffset}. */
  movementY: number;
  /** Release velocity on the y axis in px/ms (positive = downward). */
  velocityY: number;
  /** The sheet's rendered height in px. */
  height: number;
}

/**
 * Whether a released drag should dismiss the sheet: a downward flick wins on
 * velocity alone, otherwise the travel must clear both an absolute floor and a
 * share of the sheet's height (so a tall sheet needs a deliberate pull, not a
 * nudge).
 */
export function shouldDismissSheet({ movementY, velocityY, height }: SheetDismissInput): boolean {
  if (movementY <= 0) {
    return false;
  }
  if (velocityY > SHEET_DISMISS_VELOCITY) {
    return true;
  }
  const travel = Math.max(SHEET_DISMISS_MIN_PX, height * SHEET_DISMISS_RATIO);
  return movementY > travel;
}
