"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Minimal CSS FLIP for locally-reordered rows (no animation library — this app
 * is CSS-first; durations mirror `--c2-dur-standard`, eased out).
 *
 * Usage: attach `containerRef` to an element that contains one or more lists
 * marked `data-flip-container`; every row inside carries a stable
 * `data-flip-id`. On reorder call `snapshot()` BEFORE mutating the list, then
 * call `play()` on the frame after React has re-rendered. Rows that changed
 * position translate from their old spot to the new one; everything else stays
 * put. Disabled under `prefers-reduced-motion` (rows just swap instantly).
 *
 * Some surfaces render the same rows twice (a mobile card list and a desktop
 * table) — each list is its own `data-flip-container`, measured separately.
 * `display:none` lists measure zero-sized rects, so their rows never animate
 * and the hidden twin can't corrupt the visible one.
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

interface ListRects {
  element: HTMLElement;
  rects: Map<string, DOMRect>;
}

export function useFlipReorder() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const snapshotsRef = useRef<ListRects[]>([]);
  const timersRef = useRef<number[]>([]);

  /** Record each row's current rect per list. Call before mutating the order. */
  const snapshot = useCallback(() => {
    const lists: ListRects[] = [];
    const container = containerRef.current;
    if (container) {
      container.querySelectorAll<HTMLElement>("[data-flip-container]").forEach((list) => {
        const rects = new Map<string, DOMRect>();
        list.querySelectorAll<HTMLElement>("[data-flip-id]").forEach((element) => {
          const id = element.dataset.flipId;
          if (id) {
            rects.set(id, element.getBoundingClientRect());
          }
        });
        lists.push({ element: list, rects });
      });
    }
    snapshotsRef.current = lists;
  }, []);

  /** Animate rows from their snapshot position into their current one. Call
   *  after the reorder has rendered. */
  const play = useCallback(() => {
    if (reducedMotion()) {
      return;
    }
    // Invert: start each moved row where it was, per list.
    const groups: { list: HTMLElement; elements: HTMLElement[] }[] = [];
    for (const { element: list, rects: oldRects } of snapshotsRef.current) {
      const moved: HTMLElement[] = [];
      list.querySelectorAll<HTMLElement>("[data-flip-id]").forEach((element) => {
        const id = element.dataset.flipId;
        const old = id ? oldRects.get(id) : undefined;
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
      if (moved.length > 0) {
        groups.push({ list, elements: moved });
      }
    }
    if (groups.length === 0) {
      return;
    }
    // Play: force a reflow, then animate every moved row to its resting spot.
    const all = groups.flatMap((group) => group.elements);
    const finish = () => {
      for (const element of all) {
        element.style.transition = "";
        element.style.transform = "";
        element.style.willChange = "";
      }
    };
    const timer = window.setTimeout(finish, FLIP_DURATION_MS + 60);
    timersRef.current.push(timer);
    for (const group of groups) {
      void group.list.offsetHeight;
    }
    for (const element of all) {
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
