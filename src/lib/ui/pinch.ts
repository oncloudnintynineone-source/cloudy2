/**
 * Pinch-gesture math for the dashboard's zoomable grids (the DOM half lives in
 * pinchZoom.ts). Pure (no DOM, no React) so the axis classification, the scale
 * mapping and the focal point are unit-tested without a browser.
 *
 * A pinch is a two-finger spread: the gesture start records the two touch
 * points, then every move reports the spread relative to that start. Snapping
 * the scale onto the discrete zoom levels is deliberately NOT done here — the
 * existing `clampZoom` / `clampGridWeekColZoom` / `clampMonthZoom` already snap
 * a raw number to the nearest level, so the consumers reuse them.
 */

export interface PinchPoint {
  x: number;
  y: number;
}

/** Which zoom axis a pinch drives: "x" = horizontal spread, "y" = vertical. */
export type PinchAxis = "x" | "y";

/** Euclidean distance between two touch points. */
export function pinchDistance(a: PinchPoint, b: PinchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Midpoint between two touch points (the zoom focal point). */
export function pinchMidpoint(a: PinchPoint, b: PinchPoint): PinchPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Which zoom axis a two-finger spread drives: the wider side of the initial
 * spread wins — fingers side by side → horizontal (columns), stacked →
 * vertical (rows). Classified once at the gesture start so the axis can't
 * flicker mid-pinch.
 */
export function pinchAxis(a: PinchPoint, b: PinchPoint): PinchAxis {
  return Math.abs(a.x - b.x) >= Math.abs(a.y - b.y) ? "x" : "y";
}

/**
 * Scale of the current spread relative to the gesture start (1 = unchanged).
 * A degenerate start (fingers on the same spot) returns 1 rather than
 * Infinity/NaN, so a corrupt gesture can never produce a bogus zoom level.
 */
export function pinchScale(startDistance: number, distance: number): number {
  if (!Number.isFinite(startDistance) || !Number.isFinite(distance)) {
    return 1;
  }
  if (startDistance <= 0 || distance <= 0) {
    return 1;
  }
  return distance / startDistance;
}
