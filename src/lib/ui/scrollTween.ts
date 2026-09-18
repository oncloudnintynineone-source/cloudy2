"use client";

import { MOTION } from "@/lib/motion/timing";

/**
 * Eased, cancellable tween for a scroll container's `scrollLeft`/`scrollTop`.
 *
 * The dashboard's zoom re-anchor would otherwise snap the scroll offset in one
 * frame while the grid's width transitions over `--c2-dur-standard`, so the
 * anchored column visibly jumps. Tweening the offset with the same duration and
 * easing as the CSS width transition keeps the anchor stable throughout: the
 * ideal offset is affine in the zoom ratio, so an eased tween of the offset
 * matches the eased width almost exactly (the two easings are visually
 * equivalent, so any drift is sub-pixel and settles exactly).
 *
 * Fire-and-forget: a new call for the same element+axis cancels the previous
 * one. Respects `prefers-reduced-motion: reduce` (snaps immediately) and
 * ignores sub-pixel deltas so a no-op re-anchor never starts a frame loop.
 */

/** Matches `--c2-dur-standard` (and `MOTION.zoom`) in globals.css. */
const DURATION_MS = MOTION.zoom;

/** Ease-out cubic — matches the house `cubic-bezier(0.22, 1, 0.36, 1)` closely. */
export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

const inFlight = new WeakMap<HTMLElement, { left?: number; top?: number }>();

function cancel(el: HTMLElement, axis: "left" | "top"): void {
  const store = inFlight.get(el);
  if (!store) {
    return;
  }
  const id = store[axis];
  if (id !== undefined) {
    cancelAnimationFrame(id);
    delete store[axis];
  }
}

/** Cancels any in-flight tween on the element (both axes). */
export function cancelScrollTween(el: HTMLElement): void {
  cancel(el, "left");
  cancel(el, "top");
}

/**
 * Animates the element's scroll offset on `axis` to `to`. No-op for a
 * non-finite target; snaps when reduced motion is requested or the delta is
 * sub-pixel.
 */
export function animateScroll(el: HTMLElement, axis: "left" | "top", to: number): void {
  cancel(el, axis);
  if (!Number.isFinite(to)) {
    return;
  }
  const from = axis === "left" ? el.scrollLeft : el.scrollTop;
  const snap = () => {
    if (axis === "left") {
      el.scrollLeft = to;
    } else {
      el.scrollTop = to;
    }
  };
  if (Math.abs(to - from) < 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    snap();
    return;
  }

  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / DURATION_MS);
    const value = from + (to - from) * easeOutCubic(t);
    if (axis === "left") {
      el.scrollLeft = value;
    } else {
      el.scrollTop = value;
    }
    if (t < 1) {
      const store = inFlight.get(el);
      if (store) {
        store[axis] = requestAnimationFrame(step);
      }
    }
  };
  let store = inFlight.get(el);
  if (!store) {
    store = {};
    inFlight.set(el, store);
  }
  store[axis] = requestAnimationFrame(step);
}
