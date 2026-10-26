/**
 * Which viewport height the standalone shell should use.
 *
 * iOS standalone is the special case: `visualViewport.height` is the actually
 * visible area (safe-area / toolbar states can make the layout viewport
 * taller), so the shell follows it.
 *
 * Everywhere else — notably Android foldables — the layout viewport is the
 * source of truth. `visualViewport.height` can be transiently smaller while a
 * fold/posture change settles, and following it leaves the shell (and the
 * viewport-bounded Month/Dual column) short with a blank strip above the fixed
 * footer. Taking the larger of the two also keeps the shell stable when the
 * Android keyboard shrinks the visual viewport.
 *
 * Pure so the rule is unit-tested without a browser.
 */
export interface ShellViewportHeightInput {
  isIOS: boolean;
  /** `document.documentElement.clientHeight` — the layout viewport. */
  layoutHeight: number;
  /** `window.visualViewport?.height` — the visible area when available. */
  visualHeight?: number;
}

export function resolveShellViewportHeight({
  isIOS,
  layoutHeight,
  visualHeight,
}: ShellViewportHeightInput): number {
  if (isIOS) {
    return visualHeight ?? layoutHeight;
  }
  return Math.max(layoutHeight, visualHeight ?? 0);
}
