"use client";

import { type RefObject, useEffect, useState } from "react";

/** Which horizontal extremes a scroller is currently parked at. */
export interface ScrollEdges {
  atStart: boolean;
  atEnd: boolean;
}

/**
 * Pure horizontal scroll-edge measurement: a container whose content fits
 * reports **both** extremes (nothing is clipped on either side, so neither
 * edge affordance may lie about hidden content), otherwise each edge is where
 * the scroll position sits within `tolerance` px of that extreme.
 */
export function measureScrollEdges(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  tolerance = 1,
): ScrollEdges {
  const max = scrollWidth - clientWidth;
  if (max <= tolerance) {
    return { atStart: true, atEnd: true };
  }
  return { atStart: scrollLeft <= tolerance, atEnd: scrollLeft >= max - tolerance };
}

/**
 * Live {@link measureScrollEdges} result for a horizontal scroller element.
 * Re-measures on scroll (passive — the state only changes at the extremes, so
 * mid-scroll events are cheap), on pointer release (momentum settles without a
 * `scrollend` on older Safari), and on resize (the clip can appear/disappear
 * without any scroll). Programmatic scrolls (scroll-into-view) fire `scroll`
 * too, so the edges follow a jump automatically.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({ atStart: true, atEnd: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const measure = () => {
      const next = measureScrollEdges(el.scrollLeft, el.scrollWidth, el.clientWidth);
      setEdges((prev) =>
        prev.atStart === next.atStart && prev.atEnd === next.atEnd ? prev : next,
      );
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    el.addEventListener("pointerup", measure);
    el.addEventListener("pointercancel", measure);
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      el.removeEventListener("pointerup", measure);
      el.removeEventListener("pointercancel", measure);
      window.removeEventListener("resize", measure);
    };
  }, [ref]);

  return edges;
}
