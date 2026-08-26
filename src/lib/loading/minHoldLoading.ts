"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Minimum time a loading skeleton stays visible after its load begins. With
 * warm data (L1 cache, no-op Google stub in dev) an RSC round-trip can land in
 * well under 100ms — the skeleton would flash and the content swap would read
 * as a hard cut. Holding the skeleton for this window makes every
 * skeleton → content reveal a deliberate, perceptible sequence.
 */
export const MIN_SKELETON_HOLD_MS = 350;

/**
 * Returns `pending` with a minimum hold applied: true while `pending` is
 * true, and — when the load ends early — true until `holdMs` have elapsed
 * since the load started.
 *
 * A new pending supersedes any outstanding hold (the skeleton is shown by
 * `pending` itself), so holds never stack across fast consecutive
 * navigations. Timing uses `performance.now()` in effects only, so SSR
 * renders are unaffected.
 */
export function useMinSkeletonHold(
  pending: boolean,
  holdMs: number = MIN_SKELETON_HOLD_MS,
): boolean {
  const [holdRemaining, setHoldRemaining] = useState(false);
  const loadStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (pending) {
      // Only the start timestamp matters while loading; a superseded hold
      // needs no state update here — `pending` alone keeps the skeleton
      // visible, and the end edge below recomputes (or clears) the flag.
      if (loadStartRef.current === null) {
        loadStartRef.current = performance.now();
      }
      return;
    }
    const startedAt = loadStartRef.current;
    loadStartRef.current = null;
    const remaining =
      startedAt === null ? 0 : holdMs - (performance.now() - startedAt);
    // No-op when the flag already matches (React bails out on equal values).
    setHoldRemaining(remaining > 0);
    if (remaining <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setHoldRemaining(false), remaining);
    return () => window.clearTimeout(timer);
  }, [pending, holdMs]);

  return pending || holdRemaining;
}
