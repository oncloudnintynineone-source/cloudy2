/**
 * Pure rules for the "always-fresh route" client revalidation
 * (`useLiveRouteRefresh`, `src/lib/loading/liveRefresh.ts`). Kept free of React
 * and the DOM so the freshness decision is unit-tested without a browser.
 *
 * Why this exists: Next's client Router Cache (`staleTimes.dynamic = 120`) and
 * the PWA SWR RSC cache can replay an old payload for a URL that was visited
 * before, so an always-fresh route (the audit log) can finish its loading state
 * with stale rows. The server render stamps a `renderedAt` (epoch ms); the
 * client compares it to its own clock and, when the payload is older than the
 * window, forces one live re-read. Server-vs-client clock comparison already
 * backs `isDocumentFresh` (`swRules.ts`), so the same skew exposure applies here
 * (a badly wrong device clock can only cause an extra harmless refresh, or none
 * — never a crash).
 */

/**
 * How old a server-rendered payload may be before the client forces a live
 * re-read. Kept small: a payload that reached the client over the network has an
 * age of only the transit + hydration time, while a Router-Cache/SWR replay
 * carries the age of the original render (seconds to minutes), so the two are
 * cleanly separated. The window absorbs a slow cold render without falsely
 * re-reading a genuinely fresh payload.
 */
export const LIVE_ROUTE_MAX_AGE_MS = 2000;

/** Window event the shell dispatches to ask the mounted always-fresh route to
 *  re-read itself (the header Force refresh, soft path — no document reload). */
export const LIVE_REFRESH_EVENT = "cloudy2:live-refresh";

/**
 * Whether a payload stamped at `renderedAt` is old enough to justify a live
 * re-read. A non-finite stamp is treated as fresh (never hammer the network); a
 * future stamp (clock skew) clamps to age 0.
 */
export function needsLiveRefresh(
  renderedAt: number,
  now: number,
  maxAgeMs: number = LIVE_ROUTE_MAX_AGE_MS,
): boolean {
  if (!Number.isFinite(renderedAt)) {
    return false;
  }
  return now - renderedAt > maxAgeMs;
}
