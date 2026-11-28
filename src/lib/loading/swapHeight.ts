/**
 * Pure height bookkeeping for `CrossfadeSwap`'s `animateHeight` path.
 *
 * The skeleton's height is measured from the live wrapper, but a kept-mounted
 * dialog renders its content with `display: none` for the opening frames
 * (Mantine's Transition moves "exited" -> "entering" two animation frames after
 * `mounted` flips), so a read in that window reports 0. A 0 must never be
 * recorded as the skeleton height: locking the dialog to it collapses the modal
 * to a sliver and then plays a second expand animation — the
 * shrink-then-expand reveal. The caller keeps re-reading until the box is laid
 * out; these helpers decide what is safe to record and to animate.
 */

/** The smallest height change worth animating, in px. */
export const MIN_SWAP_HEIGHT_DELTA_PX = 1;

/**
 * Keep the last laid-out skeleton height: an un-measurable read (0 / negative
 * / NaN) is never recorded, so the reveal can't lock the dialog to nothing.
 */
export function recordSkeletonHeight(current: number | null, measured: number): number | null {
  return Number.isFinite(measured) && measured > 0 ? measured : current;
}

/**
 * Whether a skeleton -> content height change should animate. Both ends must be
 * real, non-zero, laid-out heights: a missing/0 skeleton read (the dialog was
 * never painted) falls back to no height animation — a clean swap — instead of
 * locking at 0. A sub-pixel difference isn't worth a resize. The predicate
 * narrows `from`, so a caller that proceeds has a concrete lock height.
 */
export function shouldAnimateSwapHeight(from: number | null, to: number): from is number {
  if (from === null || !Number.isFinite(from) || from <= 0) {
    return false;
  }
  if (!Number.isFinite(to) || to <= 0) {
    return false;
  }
  return Math.abs(to - from) >= MIN_SWAP_HEIGHT_DELTA_PX;
}
