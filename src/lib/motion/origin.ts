/**
 * Pure helpers for the "expand/shrink from target" modal animation.
 *
 * Modals in this app are `centered` with a fixed `size`, so the modal
 * content's center always coincides with the viewport center. That means a
 * `transform-origin` pinned to the tapped element can be expressed in the
 * content's own coordinates using only the element's viewport rect — no
 * content measurement or layout pass needed.
 */

export interface ViewportSize {
  w: number;
  h: number;
}

/** Minimal shape of a bounding rect (structural — plain objects work too). */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Builds a `transform-origin` (relative to a centered modal content box) that
 * lands exactly on the center of `rect`. Falls back to `fallback` (e.g.
 * "center" or "bottom right") when no rect is available.
 */
export function transformOriginFromRect(
  rect: Rect | null,
  viewport: ViewportSize,
  fallback = "center",
): string {
  if (!rect) {
    return fallback;
  }
  const dx = rect.left + rect.width / 2 - viewport.w / 2;
  const dy = rect.top + rect.height / 2 - viewport.h / 2;
  return `calc(50% + ${dx}px) calc(50% + ${dy}px)`;
}

/**
 * Content width of a centered fixed-size modal: the smaller of the modal's
 * size (Mantine defaults: sm 380px, md 440px, lg 620px at the default scale)
 * and 90vw.
 */
export function modalContentWidth(viewport: ViewportSize, sizePx: number): number {
  return Math.min(sizePx, viewport.w * 0.9);
}

/** Content width of a centered `size="sm"` modal (min of 380px and 90vw). */
export function smModalContentWidth(viewport: ViewportSize): number {
  return modalContentWidth(viewport, 380);
}

/**
 * Scale factor that collapses the modal roughly to the target element's size.
 * Clamped to `[min, max]` so the effect stays visible for tiny targets and
 * never becomes a near-full-size pop for large ones. Falls back to `fallback`
 * when no rect is available.
 */
export function scaleFromRect(
  rect: Rect | null,
  contentWidth: number,
  fallback = 0.3,
  min = 0.12,
  max = 0.6,
): number {
  if (!rect) {
    return fallback;
  }
  const scale = Math.min(rect.width / contentWidth, rect.height / (contentWidth * 0.8));
  if (Number.isNaN(scale) || scale <= 0) {
    return fallback;
  }
  return Math.max(min, Math.min(scale, max));
}
