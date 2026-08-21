"use client";

import { useEffect } from "react";

/**
 * Android Chrome (and iOS Safari) scroll a control into view the moment it
 * receives focus. Mantine's Combobox focuses its Select target with a plain
 * `element.focus()` (no `preventScroll`), so tapping a Select inside a Modal
 * can scroll the modal's `overflow-y: auto` content and chain into the
 * document — whose scroll container doubles as the AppShell's — panning the
 * whole page (a visible "spasm" when the page is zoomed in).
 *
 * This breaks the chain before focus happens: on the capture-phase
 * `pointerdown` (which fires before native focus and before Mantine's
 * programmatic focus), scroll the tapped focusable control into view with a
 * minimal, non-chaining `block: "nearest"` scroll. When the browser's own
 * focus-scroll then runs, the control is already fully visible, so it is a
 * no-op and the page never moves.
 */
export function useContainModalFocusScroll() {
  useEffect(() => {
    const FOCUSABLE_SELECTOR =
      'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])';

    const handlePointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (!target || typeof target.closest !== "function") return;
      // Only controls inside an open Modal: the modal content box is the one
      // scroll container that may move here (the page behind it must not).
      if (!target.closest("[data-modal-content]")) return;
      const focusable = target.closest(FOCUSABLE_SELECTOR) as HTMLElement | null;
      if (!focusable || typeof focusable.scrollIntoView !== "function") return;
      focusable.scrollIntoView({ block: "nearest", behavior: "auto" });
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, []);
}
