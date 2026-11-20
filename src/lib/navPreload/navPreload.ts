/**
 * Pure warm-plan helpers for the idle bulk preload of the four high-traffic
 * nav pages (Parade State, Contacts, Double Booking, My Events). See
 * docs/loading-transitions.md §1.15.
 *
 * One pass per signed-in user per document. The prefetch runs that page's
 * server render, which warms the config cache and the cache-backed month read,
 * and lands the payload in the router + RSC caches so a later tap paints
 * without a round trip. It deliberately does **not** re-run when the dashboard
 * moves to another month: that turned every month step into three extra route
 * renders, competing with the read the user was waiting for. The plan is pure —
 * no DOM, no I/O — so the once-per-signature rule is unit-testable.
 */

/** Nav routes warmed at idle on capable devices (the rest stay intent-only).
 *  My Events joins them because it is the one always-fresh content route: the
 *  SW never replays a stale document for it, so without this warm pass every
 *  entry pays the full wide-window build on the critical path. The
 *  always-fresh guarantee survives the warm payload — `useLiveRouteRefresh`
 *  forces one live re-read when the painted payload is older than
 *  `LIVE_ROUTE_MAX_AGE_MS` (paint-then-swap). */
export const NAV_PRELOAD_HREFS = [
  "/parade-state",
  "/contacts",
  "/double-booking",
  "/my-events",
] as const;

/** The plan key: one warm pass per signed-in user per document. */
export function navPreloadSignature(userId: string): string {
  return `${userId}::session`;
}

/**
 * Whether this signature still needs a pass. Returns the signature to run, or
 * null when it was already covered this session. Prefetch URLs stay bare base
 * hrefs — one-shot params (`?refresh` etc.) must never enter a cache key.
 */
export function planNavPreload(seen: ReadonlySet<string>, signature: string): string | null {
  return seen.has(signature) ? null : signature;
}
