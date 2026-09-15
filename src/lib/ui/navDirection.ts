"use client";

import { useEffect } from "react";

/**
 * Navigation direction for the directional page transition
 * (docs/native-feel.md).
 *
 * The App Router does not expose whether a navigation is a push or a pop, so
 * this module infers it from user intent: a same-origin link click is a
 * forward navigation, and a `popstate` (hardware/gesture back, browser
 * back/forward) is a back navigation. `PageTransition` reads the last signal
 * through `useSyncExternalStore` and picks the matching slide direction,
 * falling back to the original fade+rise when the direction is unknown (e.g.
 * the first load).
 *
 * The value is module-level and intentionally not reset: a stale "forward" is
 * the correct guess for the vast majority of programmatic navigations, and
 * resetting without notifying would desync the `useSyncExternalStore`
 * snapshot.
 */

export type NavDirection = "forward" | "back" | null;

let direction: NavDirection = null;
const listeners = new Set<() => void>();

export function getNavDirection(): NavDirection {
  return direction;
}

/** SSR / pre-hydration snapshot: no direction is known, so fade+rise is used. */
export function getServerNavDirection(): NavDirection {
  return null;
}

export function subscribeNavDirection(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setNavDirection(next: NavDirection): void {
  if (direction === next) {
    return;
  }
  direction = next;
  for (const listener of listeners) {
    listener();
  }
}

/** A same-origin `<a href>` click is a forward navigation (Next's `<Link>`). */
function handleDocumentClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) {
    return;
  }
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  const target = event.target as Element | null;
  const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || anchor.hasAttribute("download")) {
    return;
  }
  if (anchor.target && anchor.target !== "_self") {
    return;
  }
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) {
    return;
  }
  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) {
    return;
  }
  // A same-URL click (e.g. re-tapping the active tab) does not navigate.
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return;
  }
  setNavDirection("forward");
}

/**
 * Install the direction signals once (mounted in the protected shell): a
 * capture-phase document click listener for forward navigations and a
 * `popstate` listener for back navigations.
 */
export function useNavDirectionTracking(): void {
  useEffect(() => {
    document.addEventListener("click", handleDocumentClick, true);
    const onPopState = () => setNavDirection("back");
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);
}
