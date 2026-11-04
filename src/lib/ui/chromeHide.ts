"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Hide a page's mobile floating chrome — the dashboard's bottom control pill
 * and FAB row, the Contacts / Parade State control pills — while the user is
 * touching the page's content pane: on touch alone (even without any
 * scrolling) and on any scroll, either axis. The chrome slides back only once
 * the interaction has **fully** stopped: the last finger/pointer has lifted
 * AND the scrolling has settled.
 *
 * "The content pane" is the caller's page-content element (the dashboard's
 * `weekBoxRef` content box with every grid + pinned strips; the Contacts /
 * Parade State page columns). The floating rows are `Affix`-portaled to
 * `<body>` outside the pane, so a pane-scoped trigger can never be triggered
 * by the chrome itself — tapping a pill button keeps the pill up. The rows are
 * also deliberately `pointer-events: none` (only their buttons/inputs opt back
 * in) so taps on their label/padding/gap areas reach the content beneath; those
 * taps still *land over* the chrome, so the pane handler hit-tests the press
 * point against every `.c2-chrome-hide-able` rect and ignores it — a tap that
 * looks like chrome interaction must never flash the chrome away. Contact
 * tracking, by contrast, is screen-wide (document): once hidden, the chrome
 * stays hidden while *any* finger/pointer is down, even if it slides off the
 * pane (e.g. onto the bottom nav).
 *
 * Contact is tracked per input type because the two event systems disagree
 * about when a touch gesture ends:
 * - **Touch** — the authoritative "fingers on screen" count is
 *   `TouchEvent.touches.length`, updated on `touchstart`/`touchend`/`touchcancel`.
 *   A canceled touch is removed from `touches` by the browser and never
 *   receives a `touchend` (e.g. the modal overlay a tap started on is removed
 *   mid-gesture), so `touchcancel` must update the count too — treating it as
 *   "finger may still be down" would strand the count above zero forever and
 *   the chrome could never reveal again. The pointer-events `pointercancel`
 *   fires when the browser takes over a touch to drive a native scroll —
 *   *while the finger is still down* — and no `pointerup` follows it, so it
 *   must NOT be treated as a release.
 * - **Mouse / pen** — `pointerdown`/`pointerup` pair; a `pointercancel` here
 *   is a genuine release.
 *
 * Scroll sources: document scrolling (window) and the page's internal
 * ScrollArea viewports (the dashboard's month/week/day pan, Week (Grid) hour
 * rows, dual panes). `scroll` does not bubble, so the pane listens in the
 * **capture** phase to catch descendant viewports; `scrollend` bubbles, so the
 * same pane node catches the internal viewports and a `document` capture
 * listener catches document scrolling. `scrollend` is missing in older
 * browsers — a short debounce after the last `scroll` event settles it there
 * (the rail-chevron pattern in `AppShellShell.tsx` is the in-repo precedent).
 *
 * Only a **user-driven** scroll may *start* a hide. A visible chrome is hidden
 * by a press on the pane (which happens first on any touch drag) or a wheel
 * scroll; a `scroll` with no pane press behind it is a programmatic side effect
 * — a dialog's scroll lock, a focus `scrollIntoView`, or a grid scroll reset
 * after a period change — and must not flash the chrome. Once hidden, every
 * scroll is processed so momentum keeps it hidden until it settles.
 *
 * The visibility transition is the pure `advanceChromeHide` below (unit-
 * tested); the hook only wires DOM events into it.
 */

/** Debounce that settles scrolling on browsers without `scrollend`. */
export const SCROLL_SETTLE_FALLBACK_MS = 150;

/** Every element that rides the mobile floating-chrome hide state. */
export const CHROME_HIDE_SELECTOR = ".c2-chrome-hide-able";

/** The part of a `DOMRect` a hit test needs. */
export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Whether a viewport point lies inside a rect. */
export function pointInRect(x: number, y: number, rect: RectLike): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** Whether a viewport point lies inside any of the rects. */
export function pointInAnyRect(x: number, y: number, rects: Iterable<RectLike>): boolean {
  for (const rect of rects) {
    if (pointInRect(x, y, rect)) {
      return true;
    }
  }
  return false;
}

export interface ChromeHideState {
  /** Fingers currently down, from `TouchEvent.touches.length`. */
  touchPoints: number;
  /** Mouse/pen pointers currently down (started in the pane). */
  otherPointers: number;
  /** Scrolling not yet settled (no `scrollend` / debounce since the last `scroll`). */
  scrolling: boolean;
  /** Current visibility of the chrome. */
  hidden: boolean;
}

export type ChromeHideEvent =
  /** A touch landed in the pane (trigger). */
  | { type: "touch-down" }
  /** `touchstart`/`touchend`/`touchcancel` on the document: the current finger count. */
  | { type: "touch-count"; count: number }
  /** A mouse/pen pointer pressed in the pane (trigger). */
  | { type: "pointer-down" }
  /** A mouse/pen pointer released (anywhere). */
  | { type: "pointer-up" }
  /**
   * A scroll event. `fromUser: false` (default `true`) marks a scroll with no
   * pane press or wheel behind it — a dialog scroll lock, a focus
   * `scrollIntoView`, or a layout reset: it never *starts* a hide.
   */
  | { type: "scroll"; fromUser?: boolean }
  | { type: "scroll-settled" }
  | { type: "reset" };

export function initialChromeHideState(): ChromeHideState {
  return { touchPoints: 0, otherPointers: 0, scrolling: false, hidden: false };
}

/** Reveals the chrome only when nothing is pressed and scrolling has settled. */
function settle(state: ChromeHideState): ChromeHideState {
  if (state.hidden && state.touchPoints === 0 && state.otherPointers === 0 && !state.scrolling) {
    return { ...state, hidden: false };
  }
  return state;
}

/**
 * The transition. Any press in the pane or any unsettled scroll keeps the
 * chrome hidden; it reappears only once the last finger/pointer has lifted AND
 * scrolling has settled. `reset` (tab/view switch, context change, re-
 * enabling) forces it back immediately. Returns the previous reference where
 * nothing changed so the hook can skip no-op renders.
 */
export function advanceChromeHide(state: ChromeHideState, event: ChromeHideEvent): ChromeHideState {
  switch (event.type) {
    case "touch-down":
      return state.hidden ? state : { ...state, hidden: true };
    case "touch-count":
      return settle({ ...state, touchPoints: event.count });
    case "pointer-down":
      return { ...state, otherPointers: state.otherPointers + 1, hidden: true };
    case "pointer-up":
      return settle({ ...state, otherPointers: Math.max(0, state.otherPointers - 1) });
    case "scroll":
      // A visible chrome is only hidden by a real user gesture; a programmatic
      // scroll (dialog lock / focus / layout reset) would otherwise flash it.
      if (!state.hidden && event.fromUser === false) {
        return state;
      }
      return state.hidden && state.scrolling ? state : { ...state, scrolling: true, hidden: true };
    case "scroll-settled":
      return settle({ ...state, scrolling: false });
    case "reset":
      return state.hidden || state.touchPoints !== 0 || state.otherPointers !== 0 || state.scrolling
        ? { touchPoints: 0, otherPointers: 0, scrolling: false, hidden: false }
        : state;
  }
}

export function useChromeHide({
  enabled,
  paneRef,
  resetKey,
}: {
  /** `false` (desktop at `lg`+) detaches everything — the behavior is mobile-only. */
  enabled: boolean;
  /** The page's content pane (the element the user scrolls/touches). */
  paneRef: RefObject<HTMLElement | null>;
  /** Changes (tab/view switch, context change) force the chrome back, whatever the interaction state. */
  resetKey?: string | number | boolean;
}): boolean {
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);
  const stateRef = useRef<ChromeHideState>(initialChromeHideState());
  const settleTimerRef = useRef<number | null>(null);
  // Whether the current gesture started on the content pane (as opposed to on
  // the floating chrome). Only a pane gesture can *start* a hide via `scroll`.
  const panePressRef = useRef(false);

  const dispatch = useCallback((event: ChromeHideEvent) => {
    const next = advanceChromeHide(stateRef.current, event);
    stateRef.current = next;
    if (next.hidden !== hiddenRef.current) {
      hiddenRef.current = next.hidden;
      setHidden(next.hidden);
    }
  }, []);

  // `scroll` → mark scrolling (and hide) → arm the settle fallback. The
  // fallback only matters where `scrollend` never fires; a real `scrollend`
  // settles earlier and the stray timer then no-ops (already settled).
  const armSettle = useCallback(() => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
    }
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      dispatch({ type: "scroll-settled" });
    }, SCROLL_SETTLE_FALLBACK_MS);
  }, [dispatch]);

  const onScroll = useCallback(() => {
    const state = stateRef.current;
    // A scroll with no pane press or active pointer behind it is a programmatic
    // side effect (dialog scroll lock, focus `scrollIntoView`, a grid reset
    // after a period change). Hiding on it would flash a visible chrome.
    const fromUser = panePressRef.current || state.touchPoints > 0 || state.otherPointers > 0;
    if (!state.hidden && !fromUser) {
      return;
    }
    armSettle();
    dispatch({ type: "scroll", fromUser });
  }, [armSettle, dispatch]);

  // Wheel/trackpad scrolling (the narrow-desktop tier of the mobile layout) is
  // user-driven even without a pointer pressed on the pane.
  const onWheel = useCallback(() => {
    armSettle();
    dispatch({ type: "scroll", fromUser: true });
  }, [armSettle, dispatch]);

  const onScrollEnd = useCallback(() => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    dispatch({ type: "scroll-settled" });
  }, [dispatch]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const pane = paneRef.current;
    if (!pane) {
      return;
    }
    // --- Pane-scoped triggers (on the pane, capture). ---
    // A touch on the pane hides the chrome. `touchstart` is the touch trigger
    // (the pointer-events `pointerdown` for a touch is *not* used here: it is
    // superseded by `pointercancel` mid-scroll, which must not read as a
    // release). Mouse/pen use `pointerdown` directly.
    //
    // The floating rows pass taps through their label/padding/gap areas
    // (`pointer-events: none`), so those presses reach the pane even though the
    // user is tapping the chrome. Hit-test the press point against every chrome
    // rect and ignore it — interacting with the chrome must never hide it.
    const isOverChrome = (x: number, y: number) => {
      const rects: RectLike[] = [];
      for (const node of document.querySelectorAll<HTMLElement>(CHROME_HIDE_SELECTOR)) {
        rects.push(node.getBoundingClientRect());
      }
      return pointInAnyRect(x, y, rects);
    };
    const onPaneTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch && isOverChrome(touch.clientX, touch.clientY)) {
        return;
      }
      panePressRef.current = true;
      dispatch({ type: "touch-down" });
    };
    const onPanePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        return;
      }
      if (isOverChrome(event.clientX, event.clientY)) {
        return;
      }
      panePressRef.current = true;
      dispatch({ type: "pointer-down" });
    };
    pane.addEventListener("touchstart", onPaneTouchStart, true);
    pane.addEventListener("pointerdown", onPanePointerDown, true);

    // --- Contact tracking (screen-wide, on `document`). ---
    // Touch: `touches.length` is the authoritative finger count, re-read on
    // `touchstart`/`touchend` **and** `touchcancel` — a canceled touch is gone
    // from `touches` and never gets a `touchend`, so ignoring it would strand
    // the count. Mouse/pen: the `pointerdown`/`pointerup` pair; a non-touch
    // `pointercancel` is a real release, a touch one is ignored (the touch
    // events own that gesture).
    const onTouchCount = (event: TouchEvent) => {
      if (event.touches.length === 0) {
        panePressRef.current = false;
      }
      dispatch({ type: "touch-count", count: event.touches.length });
    };
    const onPointerRelease = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        panePressRef.current = false;
        dispatch({ type: "pointer-up" });
      }
    };
    document.addEventListener("touchstart", onTouchCount);
    document.addEventListener("touchend", onTouchCount);
    document.addEventListener("touchcancel", onTouchCount);
    document.addEventListener("pointerup", onPointerRelease);
    document.addEventListener("pointercancel", onPointerRelease);

    // --- Scroll (trigger + settle). ---
    // `scroll` does not bubble — the capture phase catches the descendant
    // ScrollArea viewports (the dashboard's month/week/day pan, Week (Grid)
    // rows, dual panes).
    pane.addEventListener("scroll", onScroll, true);
    // …wheel/trackpad scrolling (no pressed pointer) is still user-driven.
    pane.addEventListener("wheel", onWheel, { passive: true });
    // `scrollend` bubbles — the pane catches the internal viewports…
    pane.addEventListener("scrollend", onScrollEnd);
    // …and document scrolling settles on the document capture phase (the
    // scroller is `document.documentElement`).
    document.addEventListener("scrollend", onScrollEnd, true);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      pane.removeEventListener("touchstart", onPaneTouchStart, true);
      pane.removeEventListener("pointerdown", onPanePointerDown, true);
      document.removeEventListener("touchstart", onTouchCount);
      document.removeEventListener("touchend", onTouchCount);
      document.removeEventListener("touchcancel", onTouchCount);
      document.removeEventListener("pointerup", onPointerRelease);
      document.removeEventListener("pointercancel", onPointerRelease);
      pane.removeEventListener("scroll", onScroll, true);
      pane.removeEventListener("wheel", onWheel);
      pane.removeEventListener("scrollend", onScrollEnd);
      document.removeEventListener("scrollend", onScrollEnd, true);
      window.removeEventListener("scroll", onScroll);
      panePressRef.current = false;
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, [enabled, paneRef, dispatch, onScroll, onScrollEnd, onWheel]);

  // A tab/view switch, context change (or re-enabling) puts the chrome back
  // immediately: the user is then interacting with the chrome, not the pane.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    panePressRef.current = false;
    dispatch({ type: "reset" });
  }, [enabled, resetKey, dispatch]);

  return hidden;
}
