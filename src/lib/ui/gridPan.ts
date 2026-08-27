"use client";

import { type MouseEvent, useCallback, useMemo, useRef, useState } from "react";
import { useScroller } from "@mantine/hooks";

/**
 * Desktop mouse drag-to-pan for the dashboard's horizontally scrolling grids
 * (Day/Week schedule views and Week v2). Those scroll areas are wider than
 * the viewport, but Mantine hides the native scrollbars and its own 4px bar
 * sits at the bottom of a table that is usually taller than the screen (the
 * page scrolls vertically, not the area) — so without this, a wheel mouse has
 * no discoverable way to pan horizontally.
 *
 * Uses @mantine/hooks' `useScroller` for the drag mechanics only (a >5px drag
 * suppresses the trailing click, so event/slot clicks survive). The edge
 * state is tracked here instead, on element **attach**: the grid remounts
 * after every view switch / skeleton, so a mount-time one-shot listener (what
 * useScroller does) would miss the container and keep stale edges.
 * `enabled` should be the desktop breakpoint — touch devices keep their
 * native pan and get no mouse handlers at all. Trackpad horizontal swipes and
 * Shift+wheel keep working natively alongside this.
 */
export interface GridPan {
  /** Attach to the scrolling element (Mantine ScrollArea `viewportRef`). */
  viewportRef: (node: HTMLDivElement | null) => void;
  /** Spread onto the scrolling element (Mantine `viewportProps`). Stable
   * identity across scroll frames — safe for the schedule views'
   * `scrollAreaProps`, which must not churn per frame. */
  viewportProps: {
    onMouseDown: (event: MouseEvent) => void;
    onMouseMove: (event: MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    style?: { cursor?: string };
  };
  /** Whether the viewport can still scroll towards/pan from the given edge. */
  canScrollLeft: boolean;
  canScrollRight: boolean;
  /** Smooth-scrolls roughly one viewport width to the given edge. */
  panTo: (edge: "start" | "end") => void;
}

export function useGridPan(enabled: boolean): GridPan {
  const scroller = useScroller({ draggable: enabled });
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const measureEdges = useCallback(() => {
    const element = elementRef.current;
    if (!element) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    // Same 1px tolerance useScroller applies (LTR layout).
    setCanScrollLeft(element.scrollLeft > 1);
    setCanScrollRight(element.scrollLeft < element.scrollWidth - element.clientWidth - 1);
  }, []);

  // Merging layers (Mantine/floating-ui) call callback refs with null on
  // detach but drop any cleanup they return, so the ref is self-contained:
  // it disposes the previous node's listeners itself, on the next attach or
  // on the null call — whichever comes first.
  const attached = useRef<{ node: HTMLDivElement; observer: ResizeObserver } | null>(null);
  const scrollerRef = scroller.ref;
  const viewportRef = useMemo(
    () =>
      (node: HTMLDivElement | null): void => {
        const prev = attached.current;
        if (prev) {
          prev.node.removeEventListener("scroll", measureEdges);
          prev.observer.disconnect();
          attached.current = null;
        }
        elementRef.current = node;
        scrollerRef(node);
        if (!node) {
          return;
        }
        node.addEventListener("scroll", measureEdges, { passive: true });
        const observer = new ResizeObserver(measureEdges);
        observer.observe(node);
        attached.current = { node, observer };
        measureEdges();
      },
    [scrollerRef, measureEdges],
  );

  const panTo = useCallback((edge: "start" | "end") => {
    const element = elementRef.current;
    if (!element) {
      return;
    }
    // ~90% of the visible width per tap — the built-in 200px step is far too
    // shallow for a week grid that is 12,000+ px wide.
    const distance = Math.max(120, Math.round(element.clientWidth * 0.9));
    element.scrollBy({ left: edge === "end" ? distance : -distance, behavior: "smooth" });
  }, []);

  const { onMouseDown, onMouseMove, onMouseUp, onMouseLeave } = scroller.dragHandlers;
  // The cursor is driven from React (not useScroller's inline writes) so a
  // re-render mid-drag can never blank the grabbing cursor: grab only where
  // and when panning is possible, grabbing while the drag is live.
  const cursor = enabled
    ? scroller.isDragging
      ? "grabbing"
      : canScrollLeft || canScrollRight
        ? "grab"
        : undefined
    : undefined;
  const viewportProps = useMemo(
    () => ({
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave,
      style: cursor ? { cursor } : undefined,
    }),
    [onMouseDown, onMouseMove, onMouseUp, onMouseLeave, cursor],
  );

  return {
    viewportRef,
    viewportProps,
    canScrollLeft: enabled && canScrollLeft,
    canScrollRight: enabled && canScrollRight,
    panTo,
  };
}
