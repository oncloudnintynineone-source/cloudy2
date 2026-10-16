"use client";

import { useEffect, useState } from "react";

/**
 * OS keyboard inset for floating bottom controls (Contacts search pill).
 *
 * The keyboard shrinks the *visual* viewport while `position: fixed` keeps
 * resolving against the (unchanged on iOS) layout viewport, so a fixed
 * bottom offset lands behind the keys. `useKeyboardInset()` measures the
 * covered band from `visualViewport` and lets the owner lift its control to
 * sit just above the keyboard top — and drop it back the moment the keyboard
 * shrinks, even when the input keeps focus (keyboard hide key / swipe-down
 * dismiss never fires `blur`). On Android the layout viewport itself shrinks
 * with the keyboard, so the inset computes to ~0 and no lift is needed.
 */

/**
 * Minimum visual-viewport shrinkage treated as the keyboard. iOS Safari's
 * dynamic toolbar collapse/expand also shrinks the visual viewport (by well
 * under this), and must not be mistaken for a keyboard.
 */
export const KEYBOARD_MIN_INSET_PX = 150;

/**
 * Pure keyboard-band height: how much of the layout viewport the keyboard
 * covers. `0` when nothing (or too little) is covered.
 */
export function computeKeyboardInset(
  layoutHeight: number,
  visualHeight: number,
  visualOffsetTop: number,
): number {
  const inset = layoutHeight - visualHeight - visualOffsetTop;
  return inset >= KEYBOARD_MIN_INSET_PX ? inset : 0;
}

/** Live keyboard inset in px (0 while no keyboard is up). */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () =>
      setInset(computeKeyboardInset(window.innerHeight, vv.height, vv.offsetTop));
    sync();
    vv.addEventListener("resize", sync);
    // iOS also scrolls the visual viewport as the keyboard opens/closes.
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  return inset;
}
