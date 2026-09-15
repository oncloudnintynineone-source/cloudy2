"use client";

import { useSyncExternalStore, ViewTransition, type ReactNode } from "react";

import {
  getNavDirection,
  getServerNavDirection,
  subscribeNavDirection,
} from "@/lib/ui/navDirection";

/**
 * Route-change page transition (docs/loading-transitions.md §1.14,
 * docs/native-feel.md).
 *
 * Wraps a page's content in React's `<ViewTransition>` so navigating to/from
 * the page runs a short animation on the content region only — the persistent
 * shell (header/sidebar/footer) stays put.
 *
 * The animation is **direction-aware**: a forward navigation (a link tap) slides
 * the new page in from the right, a back navigation (hardware/gesture/browser
 * back) mirrors it from the left — the platform push/pop language. When the
 * direction is unknown (first load), it falls back to the original fade+rise.
 * The `c2-page-*` view-transition classes and their keyframes live in
 * `src/app/globals.css`.
 *
 * It must wrap each `page.tsx`'s content — NOT the layout: layouts persist
 * across navigations, so their enter/exit never fire. Search-param-only
 * navigations (dashboard `?date=`, `?view=`, …) do not remount the page and
 * therefore do not animate.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const direction = useSyncExternalStore(
    subscribeNavDirection,
    getNavDirection,
    getServerNavDirection,
  );

  const enter =
    direction === "back"
      ? "c2-page-in-back"
      : direction === "forward"
        ? "c2-page-in-forward"
        : "c2-page-in";
  const exit =
    direction === "back"
      ? "c2-page-out-back"
      : direction === "forward"
        ? "c2-page-out-forward"
        : "c2-page-out";

  return (
    <ViewTransition enter={enter} exit={exit} default="none">
      {children}
    </ViewTransition>
  );
}
