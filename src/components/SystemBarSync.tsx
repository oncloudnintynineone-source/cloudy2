"use client";

import { useEffect } from "react";
import { useComputedColorScheme } from "@mantine/core";

/**
 * Marker on the `theme-color` meta this component owns. The meta is deliberately
 * NOT declared via Next's `viewport.themeColor` (see `src/app/layout.tsx`): that
 * renders it as a React-hoisted node, and removing/re-creating a React-owned
 * node crashes React (`finishedRoot.parentNode.removeChild`) when React later
 * deletes it during a `<head>` re-render. Owning the node here keeps the
 * remove-and-recreate below safe.
 */
const THEME_COLOR_META_ATTR = "data-c2-theme-color";

/**
 * Android Chrome's WebAPK initializes the system bars from OS defaults at cold
 * launch and only re-reads the page's `theme-color` / `color-scheme` when the
 * system UI is invalidated — so a fresh launch shows the wrong bar colors until
 * the user happens to toggle the system theme. This component re-asserts both
 * values from JS on every launch (and whenever the resolved scheme changes).
 *
 * - Status bar: `theme-color` (#0D47A1, the navy header color). Chrome derives
 *   the icon color from the dark-blue luminance → white icons. Chrome ignores
 *   `setAttribute()` on an existing meta element, so the node is removed and
 *   re-created to force a change it will actually observe. (In system dark mode
 *   Chrome forces the status bar black — crbug #40634649 — no web workaround.)
 * - Navigation bar: the page's `color-scheme`, written as a concrete
 *   `dark`/`light` inline style (Mantine's `var(--mantine-color-scheme)` form
 *   is not reliably consumed for nav-bar theming at cold start).
 */
export function SystemBarSync() {
  const scheme = useComputedColorScheme("light");

  useEffect(() => {
    document.documentElement.style.colorScheme = scheme;

    document.querySelector(`meta[${THEME_COLOR_META_ATTR}]`)?.remove();
    const meta = document.createElement("meta");
    meta.setAttribute(THEME_COLOR_META_ATTR, "");
    meta.name = "theme-color";
    meta.content = "#0D47A1";
    document.head.appendChild(meta);
  }, [scheme]);

  return null;
}
