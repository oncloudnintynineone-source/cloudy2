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
 * `scrollend` on older Safari), on window resize, and on **the scroller's own
 * box changing** (a `ResizeObserver`: a sibling reflowing — a longer label, a
 * tab added — changes the clip with no window event at all). Programmatic
 * scrolls (scroll-into-view) fire `scroll` too, so the edges follow a jump
 * automatically.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): ScrollEdges {
  // Both extremes first: a scroller is assumed to clip nothing until measured,
  // so an edge affordance never flashes on the pre-measurement frame (and a
  // genuinely clipped scroller shows it one frame later, not a false one).
  const [edges, setEdges] = useState<ScrollEdges>({ atStart: true, atEnd: true });

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
    // The clip depends on the scroller's own width, which a sibling can change
    // without any window event (the dashboard pill's label getting longer, a
    // settings tab being added).
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      el.removeEventListener("pointerup", measure);
      el.removeEventListener("pointercancel", measure);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [ref]);

  return edges;
}
