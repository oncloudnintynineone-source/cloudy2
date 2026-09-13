import { ViewTransition, type ReactNode } from "react";

/**
 * Route-change page transition (docs/loading-transitions.md §1.14).
 *
 * Wraps a page's content in React's `<ViewTransition>` so navigating to/from
 * the page runs a short fade + rise on the content region only — the
 * persistent shell (header/sidebar/footer) stays put. The `c2-page-in` /
 * `c2-page-out` view-transition classes and their keyframes live in
 * `src/app/globals.css`.
 *
 * It must wrap each `page.tsx`'s content — NOT the layout: layouts persist
 * across navigations, so their enter/exit never fire. Search-param-only
 * navigations (dashboard `?date=`, `?view=`, …) do not remount the page and
 * therefore do not animate.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="c2-page-in" exit="c2-page-out" default="none">
      {children}
    </ViewTransition>
  );
}
