/**
 * Pure helpers for the PWA service worker's document + RSC caching.
 * No DOM, no I/O — unit-tested without a live cache or network.
 */

/**
 * Prefixes of the page-cache names. The actual names carry a per-build
 * version suffix (see `documentCacheName` / `rscCacheName`) so a new service
 * worker build never serves documents or RSC payloads saved by an older
 * build — the old HTML references `/_next/static` chunk names that 404 on
 * the new build. Callers that don't know the current version (the page
 * client) match by prefix via `isPageCacheName`.
 */
export const APP_DOCUMENT_CACHE_PREFIX = "app-documents-swr";
export const APP_RSC_CACHE_PREFIX = "app-rsc-swr";

/**
 * Derive a short, deterministic version token from the service worker's
 * precache manifest. Every build produces a different precache (the chunk
 * hashes change), so the token changes with every deploy. FNV-1a 32-bit over
 * the serialized entries — collision-resistant enough for cache naming, no
 * crypto needed.
 */
export function swCacheVersion(manifest: unknown): string {
  const source = Array.isArray(manifest)
    ? manifest.map((entry) => JSON.stringify(entry)).join("|")
    : "";
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function documentCacheName(version: string): string {
  return `${APP_DOCUMENT_CACHE_PREFIX}-v${version}`;
}

export function rscCacheName(version: string): string {
  return `${APP_RSC_CACHE_PREFIX}-v${version}`;
}

/**
 * Whether a Cache Storage name belongs to the page caches — any build
 * version, including legacy unversioned names. Used for wipe/invalidation
 * sweeps that must cover entries written by older builds.
 */
export function isPageCacheName(name: string): boolean {
  return name.startsWith(APP_DOCUMENT_CACHE_PREFIX) || name.startsWith(APP_RSC_CACHE_PREFIX);
}

/** Paths whose navigations/RSC should never be served from cache. */
const EXCLUDED_PREFIXES = ["/login", "/api/", "/serwist/", "/_next/"] as const;
const EXCLUDED_EXACT = new Set(["/login"]);

function isExcludedPath(pathname: string): boolean {
  if (EXCLUDED_EXACT.has(pathname)) return true;
  return EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * One-shot URL params that mint a unique cache key per visit (`?refresh=`
 * force-refresh nonce, `?edit=` deep link, `?event=` details deep link —
 * the Google Calendar "Edit:" note, Pinned Events, event search —, `?_fresh=`
 * cleared-state marker). The client strips each of them right after its
 * render, so the URL is never requested again — storing its response only
 * pollutes the document/RSC caches and lets the offline fallback pick a stale
 * nonce entry as "newest". Such responses are therefore never stored (but the
 * requests are still served through the document route, so they keep the
 * offline redirect fallback).
 */
const ONE_SHOT_PARAMS = new Set(["refresh", "edit", "event", "_fresh"]);

function hasOneShotParam(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (ONE_SHOT_PARAMS.has(key)) return true;
  }
  return false;
}

function sameOrigin(url: URL, origin: string): boolean {
  return url.origin === origin;
}

/**
 * Whether a navigation (document) GET should be handled with the
 * stale-while-revalidate document cache. The caller is expected to have
 * already ensured same-origin / GET / mode === "navigate".
 */
export function isCacheableDocumentRequest(url: URL, origin: string): boolean {
  if (!sameOrigin(url, origin)) return false;
  if (isExcludedPath(url.pathname)) return false;
  return true;
}

/**
 * Whether an RSC GET should be handled with the RSC SWR cache.
 * Detected via the RSC header (value "1") and same-origin + exclusions.
 */
export function isCacheableRscRequest(
  url: URL,
  origin: string,
  headers: { get(name: string): string | null },
): boolean {
  if (!sameOrigin(url, origin)) return false;
  if (isExcludedPath(url.pathname)) return false;
  const rsc = headers.get("rsc");
  if (rsc !== "1") return false;
  return true;
}

export interface StorableCheck {
  status: number;
  /** Final URL after redirects (response.url). */
  finalUrl: string;
  /** Original request URL (before redirects). */
  requestUrl: string;
  contentType: string | null;
  origin: string;
}

function isLoginFinalUrl(finalUrl: string, origin: string): boolean {
  try {
    const u = new URL(finalUrl);
    return u.origin === origin && (u.pathname === "/login" || u.pathname.startsWith("/login/"));
  } catch {
    return false;
  }
}

/**
 * Whether a network response should be written to the document cache.
 * - status 200 only
 * - content-type contains text/html
 * - not a redirect that landed on /login (session-expired → purged instead)
 * - original request pathname not excluded
 */
export function shouldStoreDocumentResponse(check: StorableCheck): boolean {
  if (check.status !== 200) return false;
  if (isLoginFinalUrl(check.finalUrl, check.origin)) return false;
  try {
    const reqUrl = new URL(check.requestUrl);
    if (isExcludedPath(reqUrl.pathname)) return false;
    if (hasOneShotParam(reqUrl)) return false;
  } catch {
    return false;
  }
  const ct = (check.contentType ?? "").toLowerCase();
  if (!ct.includes("text/html")) return false;
  return true;
}

/**
 * Whether a network RSC response should be written to the RSC cache.
 * - status 200
 * - content-type contains text/x-component (Next RSC)
 * - not a redirect that landed on /login
 */
export function shouldStoreRscResponse(check: StorableCheck): boolean {
  if (check.status !== 200) return false;
  if (isLoginFinalUrl(check.finalUrl, check.origin)) return false;
  try {
    const reqUrl = new URL(check.requestUrl);
    if (isExcludedPath(reqUrl.pathname)) return false;
    if (hasOneShotParam(reqUrl)) return false;
  } catch {
    return false;
  }
  const ct = (check.contentType ?? "").toLowerCase();
  if (!ct.includes("text/x-component")) return false;
  return true;
}

/**
 * Whether a network fetch that landed on /login indicates a session expiry
 * that should purge the page caches + notify the client.
 */
export function isSessionExpiredResponse(check: StorableCheck): boolean {
  return isLoginFinalUrl(check.finalUrl, check.origin);
}

/**
 * A document-cache entry collected for the offline fallback: the cache key's
 * URL plus its `Date` header as epoch ms (`null` when the header is missing
 * or unparseable).
 */
export interface SavedViewEntry {
  url: string;
  savedAtMs: number | null;
}

/**
 * Pick the most recently saved entry — the "last saved view" an offline
 * fallback serves instead of a dead end. Entries without a timestamp sort as
 * oldest; ties resolve to the first entry (deterministic).
 */
export function newestSavedView(entries: readonly SavedViewEntry[]): SavedViewEntry | null {
  let best: SavedViewEntry | null = null;
  for (const entry of entries) {
    const candidateMs = entry.savedAtMs ?? Number.NEGATIVE_INFINITY;
    const bestMs = best ? (best.savedAtMs ?? Number.NEGATIVE_INFINITY) : Number.NEGATIVE_INFINITY;
    if (best === null || candidateMs > bestMs) best = entry;
  }
  return best;
}

/**
 * How recently a cached document must have been stored for it to count as up to
 * date. A cached document is *always* served instantly (§1.5 of
 * docs/pwa-offline.md — a launch must never block on a cold serverless round
 * trip), but when its `Date` is older than this the page reconciles itself
 * against the network right after paint: the user sees the last-saved grid
 * immediately and fresh data a moment later, instead of either a stale page
 * that never corrects itself or a splash that waits on the network.
 *
 * Matches Neon's scale-to-zero autosuspend: a document cached more recently
 * than this cannot have come off a cold stack, so it needs no reconcile.
 */
export const DOCUMENT_FRESH_WINDOW_MS = 5 * 60_000;

/**
 * Whether a cached document is recent enough to be considered up to date.
 *
 * `savedAtMs` is null when there is no cache entry, or when the stored response
 * carried no usable `Date` header; both count as **not** fresh, matching
 * `newestSavedView`'s "missing timestamps sort oldest". A timestamp in the
 * future (clock skew between the server's `Date` and the device) clamps to age
 * 0 rather than reading as ancient.
 */
export function isDocumentFresh(savedAtMs: number | null, now: number): boolean {
  if (savedAtMs === null) return false;
  return Math.max(0, now - savedAtMs) < DOCUMENT_FRESH_WINDOW_MS;
}

/**
 * Whether a rendered page should reconcile itself against the network.
 *
 * `cachedAtIso` is the document stamp the service worker injects when it serves
 * a cached copy (`stampDocument` → `window.__C2_STAMP__.cachedAt`). A *missing*
 * stamp means the document came straight off the network — already fresh, so
 * there is nothing to reconcile and the page must not fire a pointless refresh.
 * Anything older than `DOCUMENT_FRESH_WINDOW_MS` is reconciled in the
 * background, after paint.
 */
export function needsReconcile(cachedAtIso: string | null | undefined, now: number): boolean {
  if (!cachedAtIso) return false;
  const savedAtMs = Date.parse(cachedAtIso);
  if (Number.isNaN(savedAtMs)) return false;
  return !isDocumentFresh(savedAtMs, now);
}

/**
 * Launcher-injected tracking params that must not disqualify a `/` navigation
 * from the launch route: Android/Chrome can append them when the app is opened
 * from the home-screen icon, and the server ignores them anyway (it only ever
 * 307s from `/`).
 */
const TRACKING_PARAM_PREFIX = "utm_";

/**
 * Whether a navigation URL is the PWA start URL — `/`, optionally carrying only
 * launcher tracking params (a hash is ignored: no app route uses one). Every
 * icon tap navigates here; the launch route answers it from the precache so no
 * server round trip stands between the tap and first paint. Being lenient here
 * is the whole point: a query the matcher did not expect used to drop the
 * launch onto the blocking document route, which is the "splash never lifts"
 * regression. See docs/pwa-offline.md §1.5.1.
 */
export function isStartUrlRequest(url: URL): boolean {
  if (url.pathname !== "/") return false;
  if (url.search === "") return true;
  for (const key of url.searchParams.keys()) {
    if (!key.toLowerCase().startsWith(TRACKING_PARAM_PREFIX)) return false;
  }
  return true;
}

/**
 * Return the cache keys whose URL pathname equals the given pathname (origin
 * must match). Used to invalidate stale RSC/document entries after a mutation.
 */
export function keysForPathname(cacheKeys: string[], origin: string, pathname: string): string[] {
  const wanted = pathname;
  return cacheKeys.filter((k) => {
    try {
      const u = new URL(k);
      return u.origin === origin && u.pathname === wanted;
    } catch {
      return false;
    }
  });
}

/**
 * Inject a small <script> that exposes the cache timestamp to the page so the
 * "Saved · HH:MM" chip can render. Done by string-replace on the HTML text —
 * no DOM needed. If <head> is absent, prepend the script.
 */
export function stampDocument(html: string, cachedAtIso: string): string {
  const script = `<script>window.__C2_STAMP__={cachedAt:${JSON.stringify(cachedAtIso)}}<\/script>`;
  // Idempotent: a copy served through the offline fallback can already carry a
  // stamp — replace it instead of stacking a second script.
  const stripped = html.replace(/<script>window\.__C2_STAMP__=\{[^{}]*\}<\/script>/g, "");
  if (/<head[^>]*>/i.test(stripped)) {
    return stripped.replace(/<head[^>]*>/i, (m) => `${m}${script}`);
  }
  return `${script}${stripped}`;
}
