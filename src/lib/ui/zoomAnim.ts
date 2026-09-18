"use client";

import { MOTION } from "@/lib/motion/timing";

/**
 * Dashboard grid zoom animation.
 *
 * The zoom used to be driven by CSS transitions on the grid's width/slot plus a
 * separate JS tween for the scroll re-anchor. Two independent clocks (the CSS
 * transition vs `performance.now()`) can't be kept in sync, so the width and
 * the scroll drifted apart (the content slid/recoiled), and a registered
 * custom-property transition (`--c2-slot`) didn't run at all in Chrome (the
 * columns snapped). This module drives **both** from one rAF loop: `apply(z)`
 * writes the zoom-derived width/slot (via `--c2-zoom-anim`) and `onScroll(z)`
 * writes the scroll, from the same interpolated `z`, so they can never diverge.
 *
 * The owner element keys the animation: starting a new one cancels the previous
 * (and clears any lingering `--c2-zoom-anim`). Motion is collapsed entirely
 * under `prefers-reduced-motion: reduce` or the `c2-low-end` tier (matching the
 * CSS `html.c2-low-end *` override), so JS and CSS never disagree.
 */

/** Matches `--c2-dur-standard` (and `MOTION.zoom`) in globals.css. */
const DURATION_MS = MOTION.zoom;

/**
 * Cubic-bezier evaluator (Newton–Raphson solve for `t` at a given `x`). Used so
 * the JS animation's progress curve is the literal CSS
 * `cubic-bezier(0.22, 1, 0.36, 1)` — a plain ease-out drifts against the CSS
 * transitions that remain (e.g. the gutter margin).
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

/** The dashboard zoom easing — matches the house `cubic-bezier(0.22, 1, 0.36, 1)`. */
export const zoomEase = cubicBezier(0.22, 1, 0.36, 1);

export interface ZoomAnimation {
  /** Zoom level the animation starts from (the previous target). */
  from: number;
  /** Zoom level to animate to. */
  to: number;
  /** Write the interpolated zoom's width/slot (e.g. `--c2-zoom-anim`). */
  apply: (zoom: number) => void;
  /**
   * Called once after `apply(from)` — capture the starting geometry here (the
   * `scrollAnchorTracker`'s `capture`). The DOM is at `from` at this point.
   */
  onStart?: () => void;
  /** Write the scroll offset (the `scrollAnchorTracker`'s `apply`). */
  onScroll: (zoom: number) => void;
  /** Called once when the animation settles (e.g. clear `--c2-zoom-anim`). */
  onDone?: () => void;
}

/**
 * Tracks a scroll container's anchor across a zoom whose viewport width **and**
 * content width both change (the canvas gutter morph narrows the viewport while
 * the zoom shrinks the content).
 *
 * `capture()` records the time-content point under the anchor and the content
 * size while the DOM is at the start zoom; `apply()` re-centres that point using
 * the **measured** current content size (so percentage-width grids track the
 * wrapper's resize) and the **current** viewport width, clamped to the real
 * max. `reanchorScrollLeft` alone assumes a constant viewport width, so on
 * zoom-out to fit the target exceeded the shrunken `maxScroll` and the browser
 * clamped it — the last-step jump.
 */
export interface ScrollAnchor {
  capture: () => void;
  apply: () => void;
}

export function scrollAnchorTracker(
  viewport: HTMLElement,
  { label, focal }: { label: number; focal?: number },
): ScrollAnchor {
  let timeC = 0;
  let startTime = 0;
  return {
    capture: () => {
      const startAnchor = focal ?? viewport.clientWidth / 2;
      timeC = viewport.scrollLeft + startAnchor - label;
      startTime = viewport.scrollWidth - label;
    },
    apply: () => {
      const current = viewport.scrollWidth;
      const clientWidth = viewport.clientWidth;
      const anchor = focal ?? clientWidth / 2;
      const ratio = startTime > 0 ? (current - label) / startTime : 1;
      const max = Math.max(0, current - clientWidth);
      viewport.scrollLeft = Math.max(0, Math.min(timeC * ratio + label - anchor, max));
    },
  };
}

const inFlight = new WeakMap<HTMLElement, number>();

function motionDisabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("c2-low-end")
  );
}

/** Cancels any in-flight animation for `owner` and clears its zoom override. */
export function cancelZoomAnimation(owner: HTMLElement): void {
  const id = inFlight.get(owner);
  if (id !== undefined) {
    cancelAnimationFrame(id);
    inFlight.delete(owner);
  }
  owner.style.removeProperty("--c2-zoom-anim");
}

/**
 * Animates from `from` to `to`, calling `apply` + `onScroll` each frame from the
 * same interpolated value. `apply(from)` + `onStart()` run synchronously first
 * (so the committed frame paints at `from`, not a one-frame flash of `to`, and
 * the start geometry is captured at the old zoom). Snaps when motion is disabled
 * or the endpoints match (still capturing at `from` first so the re-anchor is
 * correct).
 */
export function animateZoom(
  owner: HTMLElement,
  { from, to, apply, onStart, onScroll, onDone }: ZoomAnimation,
): void {
  cancelZoomAnimation(owner);
  // Restore the start width, capture the start geometry, then either snap or
  // animate. `apply(from)` + `onStart()` must precede `apply(to)` so the capture
  // sees the old content/viewport sizes.
  apply(from);
  onStart?.();
  if (from === to || motionDisabled()) {
    apply(to);
    onScroll(to);
    onDone?.();
    return;
  }
  onScroll(from);
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / DURATION_MS);
    const z = from + (to - from) * zoomEase(t);
    apply(z);
    onScroll(z);
    if (t < 1) {
      inFlight.set(owner, requestAnimationFrame(step));
    } else {
      inFlight.delete(owner);
      apply(to);
      onScroll(to);
      onDone?.();
    }
  };
  inFlight.set(owner, requestAnimationFrame(step));
}
