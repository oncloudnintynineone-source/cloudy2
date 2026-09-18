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
 * writes the zoom-derived width/slot (via the axis's override var —
 * `--c2-zoom-anim` horizontally, `--c2-row-zoom-anim` for the Week (Grid) row
 * zoom) and `onScroll(z)` writes the scroll, from the same interpolated `z`, so
 * they can never diverge.
 *
 * The owner element + override var key the animation: starting a new one
 * cancels the previous (and clears any lingering override). Motion is collapsed
 * entirely under `prefers-reduced-motion: reduce` or the `c2-low-end` tier
 * (matching the CSS `html.c2-low-end *` override), so JS and CSS never disagree.
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
  /**
   * CSS custom property the animation overrides, used to cancel/clear a
   * previous run on the same owner. Defaults to `--c2-zoom-anim`; the Week
   * (Grid) row zoom passes `--c2-row-zoom-anim` so the two axes don't clobber
   * each other.
   */
  overrideVar?: string;
  /** Called once when the animation settles (e.g. clear the override var). */
  onDone?: () => void;
}

/**
 * Tracks a scroll container's anchor across a zoom whose viewport size **and**
 * content size both change (the canvas gutter morph narrows the horizontal
 * viewport while the zoom shrinks the content; the Week (Grid) row zoom lets the
 * `maxHeight`-bounded viewport shrink at low zoom). Works on either axis.
 *
 * `capture()` records the time-content point under the anchor and the content
 * size while the DOM is at the start zoom; `apply()` re-centres that point using
 * the **measured** current content size (so percentage-width grids track the
 * wrapper's resize) and the **current** viewport size, clamped to the real max.
 * A fixed-ratio re-anchor assumes a constant viewport size, so on zoom-out the
 * target exceeded the shrunken `maxScroll` and the browser clamped it — the
 * jump.
 *
 * `label` is the fixed leading offset on the axis that does **not** scale with
 * the zoom: the sticky resource-label column on the horizontal axis, or the
 * sticky day-header + all-day row on the vertical axis.
 */
export interface ScrollAnchor {
  capture: () => void;
  apply: () => void;
}

export interface ScrollAnchorOptions {
  /** Scroll axis: `"x"` (default) reads `scrollLeft`, `"y"` reads `scrollTop`. */
  axis?: "x" | "y";
  /** Fixed, non-scaling offset before the zoomed content (see above). */
  label?: number;
  /**
   * Viewport-relative coordinate to keep under the anchor (a pinch's focal
   * point). Defaults to the viewport centre — the button-driven zoom contract.
   */
  focal?: number;
}

export function scrollAnchorTracker(
  viewport: HTMLElement,
  { axis = "x", label = 0, focal }: ScrollAnchorOptions = {},
): ScrollAnchor {
  const vertical = axis === "y";
  const readScroll = () => (vertical ? viewport.scrollTop : viewport.scrollLeft);
  const writeScroll = (value: number) => {
    if (vertical) {
      viewport.scrollTop = value;
    } else {
      viewport.scrollLeft = value;
    }
  };
  const readContent = () => (vertical ? viewport.scrollHeight : viewport.scrollWidth);
  const readViewport = () => (vertical ? viewport.clientHeight : viewport.clientWidth);
  let timeC = 0;
  let startTime = 0;
  return {
    capture: () => {
      const startAnchor = focal ?? readViewport() / 2;
      timeC = readScroll() + startAnchor - label;
      startTime = readContent() - label;
    },
    apply: () => {
      const current = readContent();
      const viewportSize = readViewport();
      const anchor = focal ?? viewportSize / 2;
      const ratio = startTime > 0 ? (current - label) / startTime : 1;
      const max = Math.max(0, current - viewportSize);
      writeScroll(Math.max(0, Math.min(timeC * ratio + label - anchor, max)));
    },
  };
}

const inFlight = new WeakMap<HTMLElement, Map<string, number>>();

function motionDisabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("c2-low-end")
  );
}

/**
 * Cancels the in-flight animation for `owner` writing `varName` and clears that
 * override. Keyed per `(owner, varName)` so the two axes can animate the same
 * element (the canvas wrapper) concurrently without cancelling each other.
 */
export function cancelZoomAnimation(owner: HTMLElement, varName = "--c2-zoom-anim"): void {
  const vars = inFlight.get(owner);
  const id = vars?.get(varName);
  if (id !== undefined) {
    cancelAnimationFrame(id);
    vars?.delete(varName);
    if (vars?.size === 0) {
      inFlight.delete(owner);
    }
  }
  owner.style.removeProperty(varName);
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
  { from, to, apply, onStart, onScroll, overrideVar = "--c2-zoom-anim", onDone }: ZoomAnimation,
): void {
  cancelZoomAnimation(owner, overrideVar);
  // Restore the start size, capture the start geometry, then either snap or
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
  const track = (id: number) => {
    const vars = inFlight.get(owner) ?? new Map<string, number>();
    vars.set(overrideVar, id);
    inFlight.set(owner, vars);
  };
  const untrack = () => {
    const vars = inFlight.get(owner);
    if (vars?.delete(overrideVar) && vars.size === 0) {
      inFlight.delete(owner);
    }
  };
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / DURATION_MS);
    const z = from + (to - from) * zoomEase(t);
    apply(z);
    onScroll(z);
    if (t < 1) {
      track(requestAnimationFrame(step));
    } else {
      untrack();
      apply(to);
      onScroll(to);
      onDone?.();
    }
  };
  track(requestAnimationFrame(step));
}
