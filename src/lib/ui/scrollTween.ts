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
 * matches the eased width exactly **provided the progress curves match** — hence
 * `zoomEase` below is the literal `cubic-bezier(0.22, 1, 0.36, 1)` the CSS
 * transitions use (an approximate ease-out drifts the anchor and recoils).
 *
 * Fire-and-forget: a new call for the same element+axis cancels the previous
 * one. Respects `prefers-reduced-motion: reduce` (snaps immediately) and
 * ignores sub-pixel deltas so a no-op re-anchor never starts a frame loop.
 */

/** Matches `--c2-dur-standard` (and `MOTION.zoom`) in globals.css. */
const DURATION_MS = MOTION.zoom;

/**
 * Cubic-bezier evaluator (the standard Newton–Raphson solve for `t` at a given
 * `x`, with a bisection-free fallback via the loop's convergence). Used to match
 * the CSS transition's timing function exactly: the grid width transitions with
 * `cubic-bezier(0.22, 1, 0.36, 1)`, so the scroll tween must use the *same*
 * progress curve or the two drift apart (the anchored column visibly recoils —
 * the width outruns the scroll early, then the scroll catches up).
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const coefA = (a: number, b: number) => 1 - 3 * b + 3 * a;
  const coefB = (a: number, b: number) => 3 * b - 6 * a;
  const coefC = (a: number) => 3 * a;
  const calc = (t: number, a: number, b: number) =>
    ((coefA(a, b) * t + coefB(a, b)) * t + coefC(a)) * t;
  const slope = (t: number, a: number, b: number) =>
    3 * coefA(a, b) * t * t + 2 * coefB(a, b) * t + coefC(a);
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const s = slope(t, x1, x2);
      if (s === 0) break;
      t -= (calc(t, x1, x2) - x) / s;
    }
    return calc(t, y1, y2);
  };
}

/** The dashboard zoom easing — must match the CSS `cubic-bezier(0.22, 1, 0.36, 1)`. */
export const zoomEase = cubicBezier(0.22, 1, 0.36, 1);

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
    const value = from + (to - from) * zoomEase(t);
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
