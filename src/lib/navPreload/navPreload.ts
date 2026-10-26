/**
 * Pure warm-plan helpers for the idle bulk preload of the three high-traffic
 * nav pages (Parade State, Contacts, Double Booking). See
 * docs/loading-transitions.md §1.15.
 *
 * The client warms each route once per (user, anchor month): the prefetch runs
 * that page's server render, which warms the config cache and the cache-backed
 * month read, and lands the payload in the router + RSC caches so a later tap
 * paints without a round trip. The plan is pure — no DOM, no I/O — so the
 * once-per-signature rule and the month key are unit-testable.
 */

/** Nav routes warmed at idle on capable devices (the rest stay intent-only). */
export const NAV_PRELOAD_HREFS = ["/parade-state", "/contacts", "/double-booking"] as const;

/** `YYYY-MM` month key, matching the cookie/URL `month` anchor format. */
export function monthKeyOf(date: Date): string {
  const month = date.getMonth() + 1;
  return `${date.getFullYear()}-${String(month).padStart(2, "0")}`;
}

/** One preload pass is keyed by `userId::anchorMonth`. */
export function navPreloadSignature(userId: string, monthKey: string): string {
  return `${userId}::${monthKey}`;
}

/**
 * Whether this signature still needs a pass. Returns the signature to run, or
 * null when it was already covered this session. Prefetch URLs stay bare base
 * hrefs — one-shot params (`?refresh` etc.) must never enter a cache key.
 */
export function planNavPreload(seen: ReadonlySet<string>, signature: string): string | null {
  return seen.has(signature) ? null : signature;
}
