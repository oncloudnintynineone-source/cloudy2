/**
 * Global bottom navigation bar metrics. The bar is fixed at the bottom of
 * every protected page (AppShell footer); floating UI (FloatingToolbar) and
 * the Settings sub-tab bar must sit clear of it.
 */

export const BOTTOM_NAV_HEIGHT = 56;

/** Full bar height including the device safe-area inset. */
export const BOTTOM_NAV_HEIGHT_CSS = `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`;

/** Floating toolbar clearance: bottom nav height + the usual 16px margin. */
export const BOTTOM_NAV_FLOATING_OFFSET = `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 16px)`;
