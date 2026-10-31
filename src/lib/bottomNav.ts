/**
 * Global bottom navigation bar metrics. The bar is fixed at the bottom of
 * every protected page (AppShell footer) below the lg breakpoint; floating
 * UI (FloatingToolbar) sits clear of it via the
 * `--app-floating-bottom-offset` CSS var (globals.css).
 */

import type { BottomNavVariant } from "@/lib/settings/featureFlags";

export const BOTTOM_NAV_HEIGHT = 56;

/** Full bar height including the device safe-area inset. */
export const BOTTOM_NAV_HEIGHT_CSS = `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`;

/** Fixed tile width per variant: wider tiles show labels in full, narrower
 *  tiles fit more destinations per screen (no grow — wider viewports simply
 *  reveal more tiles). The app is locked to `tight` (72px); the other widths
 *  stay available for future experiments. */
export const RAIL_TILE_WIDTHS: Record<BottomNavVariant, number> = {
  wide: 96,
  medium: 84,
  tight: 72,
};

/**
 * Fixed tile order for the rail — the original nav order for every role
 * (entries a user can't see simply aren't in the shell's item list).
 * Unknown hrefs (not in this list) sort before the known universe.
 */
export const RAIL_ORDER = [
  "/dashboard",
  "/parade-state",
  "/contacts",
  "/double-booking",
  "/my-events",
  "/kah-status",
  "/settings",
];
