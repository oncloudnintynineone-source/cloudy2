"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Minimal CSS FLIP for locally-reordered rows (no animation library — this app
 * is CSS-first; durations mirror `--c2-dur-standard`, eased out).
 *
 * Usage: rows carry a stable `data-flip-id`; on reorder call `snapshot()`
 * BEFORE mutating the list, then call `play()` on the frame after React has
 * re-rendered. Rows that changed position translate from their old spot to the
 * new one; everything else stays put. Disabled under `prefers-reduced-motion`
 * (rows just swap instantly).
 */

/** Eased-out slide duration (ms), mirroring the app's standard cadence. */
const FLIP_DURATION_MS = 220;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

function reducedMotion(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useFlipReorder() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const snapshotRef = useRef<Map<string, DOMRect>>(new Map());
  const timersRef = useRef<number[]>([]);

  /** Record each row's current rect. Call before mutating the order. */
  const snapshot = useCallback(() => {
    const rects = new Map<string, DOMRect>();
    const container = containerRef.current;
    if (!container) {
      snapshotRef.current = rects;
      return;
    }
    container.querySelectorAll<HTMLElement>("[data-flip-id]").forEach((element) => {
      const id = element.dataset.flipId;
      if (id) {
        rects.set(id, element.getBoundingClientRect());
      }
    });
    snapshotRef.current = rects;
  }, []);

  /** Animate rows from their snapshot position into their current one. Call
   *  after the reorder has rendered. */
  const play = useCallback(() => {
    if (reducedMotion()) {
      return;
    }
    const container = containerRef.current;
    const snapshotRects = snapshotRef.current;
    if (!container) {
      return;
    }
    // Invert: start each moved row where it was.
    const moved: HTMLElement[] = [];
    container.querySelectorAll<HTMLElement>("[data-flip-id]").forEach((element) => {
      const id = element.dataset.flipId;
      const old = id ? snapshotRects.get(id) : undefined;
      if (!old) {
        return;
      }
      const next = element.getBoundingClientRect();
      const deltaY = old.top - next.top;
      if (Math.abs(deltaY) < 0.5) {
        return;
      }
      element.style.transition = "none";
      element.style.transform = `translateY(${deltaY.toFixed(1)}px)`;
      element.style.willChange = "transform";
      moved.push(element);
    });
    if (moved.length === 0) {
      return;
    }
    // Play: force a reflow, then animate every moved row to its resting spot.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    container.offsetHeight;
    const finish = () => {
      for (const element of moved) {
        element.style.transition = "";
        element.style.transform = "";
        element.style.willChange = "";
      }
    };
    const timer = window.setTimeout(finish, FLIP_DURATION_MS + 60);
    timersRef.current.push(timer);
    for (const element of moved) {
      element.style.transition = `transform ${FLIP_DURATION_MS}ms ${EASE_OUT}`;
      element.style.transform = "translateY(0)";
    }
  }, []);

  // Clear any leftover timers/transforms on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  return { containerRef, snapshot, play };
}
