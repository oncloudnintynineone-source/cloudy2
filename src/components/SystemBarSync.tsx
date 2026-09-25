"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useComputedColorScheme } from "@mantine/core";

/** No-op subscribe — the snapshot only ever flips once, on hydration. */
const subscribeNoop = () => () => {};
const getHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

/**
 * Android Chrome's WebAPK initializes the system bars from OS defaults at cold
 * launch and only re-reads the page's `theme-color` / `color-scheme` when the
 * system UI is invalidated — so a fresh launch shows the wrong bar colors until
 * the user happens to toggle the system theme. This component re-asserts both
 * values from JS on every launch (and whenever the resolved scheme changes).
 *
 * - Status bar: a `theme-color` meta, set to the brand-blue header composited
 *   over the body at the default (medium) level — light `#698DC5`, dark
 *   `#173769` — so the bar reads as one continuous surface with the header.
 *   Chrome derives the icon color from the luminance → white icons. Chrome
 *   ignores `setAttribute()` on an existing meta, so the node has to be removed
 *   and re-created for Chrome to observe the change. Rather than mutate the DOM
 *   behind React's back (which detaches a React-hoisted node and crashes React
 *   on the next `<head>` re-render), the meta is rendered here and remounted via
 *   its `key`: React itself removes the old node and inserts a fresh one, both
 *   after hydration and on every scheme change. (In system dark mode Chrome
 *   forces the status bar black — crbug #40634649 — no web workaround.)
 * - Navigation bar: the page's `color-scheme`, written as a concrete
 *   `dark`/`light` inline style (Mantine's `var(--mantine-color-scheme)` form
 *   is not reliably consumed for nav-bar theming at cold start).
 *
 * The meta is deliberately NOT declared via Next's `viewport.themeColor` (see
 * `src/app/layout.tsx`): that would render a second, React-metadata-owned meta.
 * This component's SSR output is the pre-hydration meta instead.
 */
export function SystemBarSync() {
  const scheme = useComputedColorScheme("light");
  // Flips false → true after hydration, forcing one remount of the meta so the
  // node Chrome sees is always freshly inserted (never the SSR one).
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );

  useEffect(() => {
    document.documentElement.style.colorScheme = scheme;
  }, [scheme]);

  // Brand-blue status bar: the frosted header (`rgba(13,71,161,0.62)` light /
  // `rgba(13,71,161,0.55)` dark) composited over the body, so the bar blends
  // into the header.
  const themeColor = scheme === "dark" ? "#173769" : "#698DC5";

  return <meta key={`${scheme}-${hydrated ? "h" : "s"}`} name="theme-color" content={themeColor} />;
}
