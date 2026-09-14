"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

import {
  pinchAxis,
  pinchDistance,
  pinchMidpoint,
  pinchScale,
  type PinchAxis,
  type PinchPoint,
} from "./pinch";

/** A live two-finger pinch, reported on every move past the threshold. */
export interface PinchGesture {
  /** Spread relative to the gesture start (1 = unchanged). */
  scale: number;
  /** Axis locked from the initial finger spread (see `pinchAxis`). */
  axis: PinchAxis;
  /** Focal point, relative to the target element's client box. */
  focalX: number;
  focalY: number;
}

export interface PinchZoomOptions {
  /** Fired the moment a two-finger gesture starts (before any movement). */
  onStart?: () => void;
  /** Fired on every move once the finger spread has changed past the threshold. */
  onPinch: (gesture: PinchGesture) => void;
  /** Fired once when the gesture ends (a finger lifted, or cancelled). */
  onEnd?: () => void;
  /** How far the finger spread must change (px) before the pinch is live. */
  threshold?: number;
}

const DEFAULT_THRESHOLD = 10;

/**
 * Two-finger pinch recognition for a dashboard grid viewport (the gesture math
 * is pure, in pinch.ts). The listeners are attached **natively and
 * non-passively**: React's touch handlers are passive at the root, and
 * `preventDefault` is exactly what stops the browser from page-zooming over the
 * grid — the consumer's grids also set `touch-action: pan-x pan-y` (see
 * useGridPan) so the browser never pinch-zooms the page there.
 *
 * Only two-touch gestures are claimed; a one-finger drag is left entirely to
 * the native scroll. The returned `ref` is a callback ref to merge with the
 * viewport refs (same self-contained-attach pattern as `useGridPan`).
 */
export function usePinchZoom(options: PinchZoomOptions): {
  ref: (node: HTMLElement | null) => void;
} {
  // Latest-ref idiom (the codebase's standard): the listeners are attached once
  // per element and read the current callbacks at event time. Layout-timed, so
  // the fresh closures are in place before the browser can deliver the next
  // touch event (a passive effect could still leave a stale zoom in one).
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  const attached = useRef<{ node: HTMLElement; controller: AbortController } | null>(null);
  // Live gesture state, or null when no two-finger gesture is in flight.
  const gesture = useRef<{
    idA: number;
    idB: number;
    startDistance: number;
    axis: PinchAxis;
    active: boolean;
  } | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    const previous = attached.current;
    if (previous) {
      previous.controller.abort();
      attached.current = null;
    }
    if (!node) {
      gesture.current = null;
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;

    // Touch identifiers, not list indices: the TouchList order is only
    // guaranteed for the touches already present when the gesture starts.
    const pointOf = (touches: TouchList, id: number): PinchPoint | null => {
      for (let i = 0; i < touches.length; i++) {
        const touch = touches.item(i);
        if (touch && touch.identifier === id) {
          return { x: touch.clientX, y: touch.clientY };
        }
      }
      return null;
    };

    const handleStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        // A third finger (or a plain one-finger drag) is not our gesture.
        gesture.current = null;
        return;
      }
      const first = event.touches.item(0);
      const second = event.touches.item(1);
      if (!first || !second) {
        return;
      }
      const a = { x: first.clientX, y: first.clientY };
      const b = { x: second.clientX, y: second.clientY };
      gesture.current = {
        idA: first.identifier,
        idB: second.identifier,
        startDistance: pinchDistance(a, b),
        axis: pinchAxis(a, b),
        active: false,
      };
      // Claim the sequence before the browser turns the two-finger drag into a
      // native pan (which would cancel the touches and kill the pinch).
      if (event.cancelable) {
        event.preventDefault();
      }
      optionsRef.current.onStart?.();
    };

    const handleMove = (event: TouchEvent) => {
      const current = gesture.current;
      if (!current || event.touches.length !== 2) {
        return;
      }
      const a = pointOf(event.touches, current.idA);
      const b = pointOf(event.touches, current.idB);
      if (!a || !b) {
        return;
      }
      const distance = pinchDistance(a, b);
      const threshold = optionsRef.current.threshold ?? DEFAULT_THRESHOLD;
      if (!current.active && Math.abs(distance - current.startDistance) < threshold) {
        return;
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      current.active = true;
      const midpoint = pinchMidpoint(a, b);
      const rect = node.getBoundingClientRect();
      optionsRef.current.onPinch({
        scale: pinchScale(current.startDistance, distance),
        axis: current.axis,
        focalX: midpoint.x - rect.left,
        focalY: midpoint.y - rect.top,
      });
    };

    const handleEnd = () => {
      const current = gesture.current;
      if (!current) {
        return;
      }
      gesture.current = null;
      if (current.active) {
        optionsRef.current.onEnd?.();
      }
    };

    node.addEventListener("touchstart", handleStart, { passive: false, signal });
    node.addEventListener("touchmove", handleMove, { passive: false, signal });
    node.addEventListener("touchend", handleEnd, { signal });
    node.addEventListener("touchcancel", handleEnd, { signal });

    attached.current = { node, controller };
  }, []);

  return { ref };
}
