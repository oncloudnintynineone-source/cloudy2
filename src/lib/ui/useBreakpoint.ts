"use client";

import { useMediaQuery } from "@mantine/hooks";

import { DESKTOP_MEDIA_QUERY, NARROW_MEDIA_QUERY } from "@/lib/theme";

/**
 * The app's `lg` desktop band (`40em`), matching `DESKTOP_MEDIA_QUERY`.
 * Components that need the desktop layout should use this instead of
 * re-inlining the breakpoint string (which must stay in sync with `theme.ts`).
 */
export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_MEDIA_QUERY);
}

/** Very small phones (≤ 360px), matching `NARROW_MEDIA_QUERY`. */
export function useIsNarrow(): boolean {
  return useMediaQuery(NARROW_MEDIA_QUERY);
}
