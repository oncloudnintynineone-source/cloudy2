"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Global CSS class (declared in `src/app/globals.css`) that fades content
 * in over ~300ms after a loading skeleton, inside the
 * `prefers-reduced-motion: no-preference` guard. The class is always present
 * on the content container in the markup: on a cold mount it comes with the
 * SSR HTML and plays on first paint — no JS, no hydration flash.
 */
export const CONTENT_ENTER_CLASS = "content-enter";

/**
 * Restarts the one-shot `content-enter` fade whenever `shown` flips
 * false → true — i.e. when the real content lands in place of a loading
 * skeleton (after a pending navigation, a min-hold window, or a
 * force-refresh).
 *
 * The container must NOT be remounted to reveal content (e.g. the
 * dashboard's week/schedule `ScrollArea` keeps its scroll position across
 * navigations), so the animation is restarted by removing and re-adding the
 * class. `useLayoutEffect` runs before paint, so the reveal frame already
 * shows the fade at frame 0 instead of a fully-opaque flash. The first
 * mount is skipped: the SSR-shipped class is already playing there.
 */
export function useContentEnter(ref: RefObject<HTMLElement | null>, shown: boolean): void {
  const prevShownRef = useRef<boolean | null>(null);

  useLayoutEffect(() => {
    const prev = prevShownRef.current;
    prevShownRef.current = shown;
    if (prev === null || prev === shown || !shown) {
      return;
    }
    const el = ref.current;
    if (!el) {
      return;
    }
    el.classList.remove(CONTENT_ENTER_CLASS);
    // Force a style flush so the re-add below restarts the animation.
    void el.offsetWidth;
    el.classList.add(CONTENT_ENTER_CLASS);
  }, [shown, ref]);
}
