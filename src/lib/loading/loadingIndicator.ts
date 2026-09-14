"use client";

import { useEffect, useRef, useState } from "react";

/** How long a pending load must persist before the indicator appears. */
export const LOADING_INDICATOR_DELAY_MS = 300;

/** How long the indicator stays once shown, even if the load ends sooner. */
export const LOADING_INDICATOR_MIN_HOLD_MS = 1000;

/**
 * Flicker-controlled boolean for a loading indicator: `pending` is gated by a
 * **show delay** (a load that ends before `delayMs` never appears) and, once
 * shown, held for a **minimum** duration (`minHoldMs`) so a fast load can't
 * flash it in and out. Mirrors the global activity bar's timer machine
 * (`ActivityBar`): both edges live in an effect, so SSR renders are unaffected.
 *
 * A `delayMs` of `0` shows on the next tick rather than synchronously — callers
 * that want an immediate indicator still get one a frame later, which the
 * min-hold then keeps steady.
 */
export function useLoadingIndicator(
  pending: boolean,
  {
    delayMs = LOADING_INDICATOR_DELAY_MS,
    minHoldMs = LOADING_INDICATOR_MIN_HOLD_MS,
  }: { delayMs?: number; minHoldMs?: number } = {},
): boolean {
  const [shown, setShown] = useState(false);
  const showTimer = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  // When the indicator first became visible, so the min-hold measures from the
  // show edge (not from when the load started).
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (pending) {
      // Rising edge (or pending returning mid-hold): cancel any pending hide
      // and, if not shown yet, arm the show-delay timer.
      if (holdTimer.current !== null) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      if (!shown && showTimer.current === null) {
        showTimer.current = window.setTimeout(() => {
          showTimer.current = null;
          shownAtRef.current = performance.now();
          setShown(true);
        }, delayMs);
      }
    } else {
      // Falling edge: cancel a still-pending show (the load ended before it
      // earned the indicator) and, if shown, arm the remaining min-hold.
      if (showTimer.current !== null) {
        window.clearTimeout(showTimer.current);
        showTimer.current = null;
      }
      if (shown && holdTimer.current === null) {
        const elapsed =
          shownAtRef.current === null ? 0 : performance.now() - shownAtRef.current;
        holdTimer.current = window.setTimeout(
          () => {
            holdTimer.current = null;
            shownAtRef.current = null;
            setShown(false);
          },
          Math.max(0, minHoldMs - elapsed),
        );
      }
    }

    return () => {
      if (showTimer.current !== null) {
        window.clearTimeout(showTimer.current);
        showTimer.current = null;
      }
      if (holdTimer.current !== null) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
    };
  }, [pending, shown, delayMs, minHoldMs]);

  return shown;
}
