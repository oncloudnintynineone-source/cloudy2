"use client";

import { useEffect } from "react";
import { useComputedColorScheme } from "@mantine/core";

/**
 * Android Chrome's WebAPK initializes the system bars (status + navigation)
 * from OS defaults at cold launch and only re-reads the page's `theme-color` /
 * `color-scheme` when the system UI is invalidated (dark-mode toggle, rotation,
 * etc.) — so a freshly launched install shows the wrong bar colors until the
 * user happens to toggle the system theme. This component re-asserts both
 * values from JS on every launch (and whenever the resolved scheme changes),
 * which fires Chrome's observers and forces the same re-sync.
 *
 * - Status bar: `theme-color` (#0D47A1, the navy header color). Chrome derives
 *   the status-bar icon color from the dark-blue luminance → white icons. The
 *   value is toggled brand-8 → brand-7 across a frame so the mutation always
 *   registers even when the SSR meta already carries #0D47A1.
 * - Navigation bar: the page's `color-scheme` — written as a *concrete*
 *   `dark`/`light` inline style (Mantine's `var(--mantine-color-scheme)` form
 *   is not reliably consumed for nav-bar theming at cold start).
 */
export function SystemBarSync() {
  const scheme = useComputedColorScheme("light");

  useEffect(() => {
    document.documentElement.style.colorScheme = scheme;

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", "#0a3a85");
      const raf = requestAnimationFrame(() => {
        meta.setAttribute("content", "#0D47A1");
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [scheme]);

  return null;
}
