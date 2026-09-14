"use client";

import { type MouseEvent, useCallback, useMemo, useRef, useState } from "react";
import { useScroller } from "@mantine/hooks";

/**
 * Mouse/touch drag-to-pan for the dashboard's horizontally scrolling grids
 * (Day/Week (H) schedule views and Week (D)). Those scroll areas are wider than
 * the viewport, but Mantine hides the native scrollbars and its own 4px bar
 * sits at the bottom of a table that is usually taller than the screen (the
 * page scrolls vertically, not the area) — so without drag/buttons there is
 * no discoverable way to pan horizontally on any breakpoint.
 *
 * Uses @mantine/hooks' `useScroller` for the drag mechanics only (a >5px drag
 * suppresses the trailing click, so event/slot clicks survive). The edge
 * state is tracked here instead, on element **attach**: the grid remounts
 * after every view switch / skeleton, so a mount-time one-shot listener (what
 * useScroller does) would miss the container and keep stale edges. Always
 * enabled — buttons and drag are available on both desktop and mobile
 * whenever overflow exists; native touch pan and Shift+wheel keep working
 * alongside this.
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
    style?: { cursor?: string; touchAction?: string };
  };
  /** Whether the viewport can still scroll towards/pan from the given edge. */
  canScrollLeft: boolean;
  canScrollRight: boolean;
  /** Smooth-scrolls roughly one viewport width to the given edge. */
  panTo: (edge: "start" | "end") => void;
  /**
   * Recomputes the edge flags from the current DOM. The internal
   * `ResizeObserver` watches the viewport's own box, which does not change when
   * only the scroll **content** grows (e.g. a width zoom), so callers that can
   * widen the content must invoke this after such a change. Stable identity.
   */
  remeasure: () => void;
}

export function useGridPan({
  /**
   * `touch-action` for the viewport. Passed as `pan-x pan-y` by the grids that
   * support pinch-to-zoom: it keeps native panning but stops the browser from
   * page-pinching over the grid (see pinchZoom.ts).
   */
  touchAction,
}: { touchAction?: string } = {}): GridPan {
  const scroller = useScroller({ draggable: true });
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
  // re-render mid-drag can never blank the grabbing cursor: grabbing while
  // the drag is live, grab wherever panning is possible.
  const cursor = scroller.isDragging
    ? "grabbing"
    : canScrollLeft || canScrollRight
      ? "grab"
      : undefined;
  const viewportProps = useMemo(() => {
    const style: { cursor?: string; touchAction?: string } = {};
    if (cursor) style.cursor = cursor;
    if (touchAction) style.touchAction = touchAction;
    return {
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave,
      style: Object.keys(style).length > 0 ? style : undefined,
    };
  }, [onMouseDown, onMouseMove, onMouseUp, onMouseLeave, cursor, touchAction]);

  return {
    viewportRef,
    viewportProps,
    canScrollLeft,
    canScrollRight,
    panTo,
    remeasure: measureEdges,
  };
}
