"use client";

import { useEffect, useState } from "react";

/**
 * OS keyboard inset for floating bottom controls (Contacts search pill).
 *
 * The keyboard shrinks the *visual* viewport while `position: fixed` keeps
 * resolving against the layout viewport, so a fixed bottom offset lands
 * behind the keys. `useKeyboardInset()` measures the covered band from
 * `visualViewport` and lets the owner lift its control to sit just above the
 * keyboard top — and drop it back the moment the keyboard is gone, even when
 * the input keeps focus (keyboard hide key / swipe-down dismiss never fires
 * `blur`).
 *
 * The value is **settled, not chased**: opening/closing the keyboard fires a
 * storm of `visualViewport` resize/scroll events (and the browser also
 * scrolls the page to reveal the input; on layout-resizing browsers
 * `innerHeight` and `vv.height` can even land out of order). Feeding every
 * event straight into a CSS-transitioned `bottom` makes the transition
 * re-target mid-flight and the pill visibly reverses. So a keyboard-up commit
 * is debounced until the events settle (one clean slide up at the final
 * height), while keyboard-down commits immediately (one clean slide down).
 */

/**
 * Minimum visual-viewport shrinkage treated as the keyboard. iOS Safari's
 * dynamic toolbar collapse/expand also shrinks the visual viewport (by well
 * under this), and must not be mistaken for a keyboard.
 */
export const KEYBOARD_MIN_INSET_PX = 150;

/**
 * Trailing debounce for the keyboard-up commit: the keyboard's own open
 * animation fires viewport events for a couple hundred ms; committing only
 * once they stop yields a single slide toward the final keyboard height.
 */
export const KEYBOARD_SETTLE_MS = 120;

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

/**
 * Pure commit policy for one measurement: a live keyboard schedules the
 * (debounced) lift to the measured inset; a gone keyboard clears the lift
 * immediately — no reversal, no chasing.
 */
export type KeyboardLiftCommit =
  | { kind: "clear" }
  | { kind: "schedule"; inset: number };

export function decideKeyboardLift(rawInset: number): KeyboardLiftCommit {
  return rawInset > 0 ? { kind: "schedule", inset: rawInset } : { kind: "clear" };
}

/**
 * Live keyboard inset in px (0 while no keyboard is up), committed per the
 * settled policy above — safe to drive a CSS-transitioned offset with.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancel = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const sync = () => {
      const decision = decideKeyboardLift(
        computeKeyboardInset(window.innerHeight, vv.height, vv.offsetTop),
      );
      if (decision.kind === "clear") {
        cancel();
        setInset(0);
      } else {
        cancel();
        timer = setTimeout(() => {
          timer = null;
          setInset(decision.inset);
        }, KEYBOARD_SETTLE_MS);
      }
    };
    sync();
    vv.addEventListener("resize", sync);
    // iOS also scrolls the visual viewport as the keyboard opens/closes.
    vv.addEventListener("scroll", sync);
    return () => {
      cancel();
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  return inset;
}
