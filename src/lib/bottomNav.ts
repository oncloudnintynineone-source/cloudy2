/**
 * Global bottom navigation bar metrics. The bar is fixed at the bottom of
 * every protected page (AppShell footer) below the lg breakpoint; floating
 * UI (FloatingToolbar) sits clear of it via the
 * `--app-floating-bottom-offset` CSS var (globals.css).
 */

export const BOTTOM_NAV_HEIGHT = 56;

/** Full bar height including the device safe-area inset. */
export const BOTTOM_NAV_HEIGHT_CSS = `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`;
