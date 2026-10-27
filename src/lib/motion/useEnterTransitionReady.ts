"use client";

import { useEffect, useState } from "react";

/**
 * Mantine's Transition starts in the "entered" state when its very first render
 * already has `opened`, so an overlay that is mounted *already open* (a lazily
 * mounted dialog, or one rendered conditionally on open) skips its entrance
 * animation. Holding the target value false for the first frame lets the closed
 * state commit; the next frame then flips it true, so the normal enter
 * transition runs. Overlays first mounted closed, and every later open/close
 * cycle, pass straight through.
 */
export function useEnterTransitionReady(opened: boolean): boolean {
  const [ready, setReady] = useState(!opened);

  useEffect(() => {
    if (!opened || ready) {
      return;
    }
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, [opened, ready]);

  return opened && ready;
}
