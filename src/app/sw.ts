/// <reference lib="esnext" />
 /// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

import {
  documentCacheName,
  isCacheableDocumentRequest,
  isCacheableRscRequest,
  isPageCacheName,
  isSessionExpiredResponse,
  isStartUrlRequest,
  launchDecision,
  newestSavedView,
  rscCacheName,
  shouldStoreDocumentResponse,
  shouldStoreRscResponse,
  stampDocument,
  swCacheVersion,
  type SavedViewEntry,
} from "@/lib/pwa/swRules";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Per-build version token for the page caches (see swRules for why the names
// are versioned). Computed once at module load from this build's precache
// manifest — a new deploy yields a new token, so this build only ever reads
// caches it (or this build) wrote.
const PAGE_CACHE_VERSION = swCacheVersion(self.__SW_MANIFEST);
const APP_DOCUMENT_CACHE = documentCacheName(PAGE_CACHE_VERSION);
const APP_RSC_CACHE = rscCacheName(PAGE_CACHE_VERSION);

// Helpers used inside plugins (small, no extra imports needed in the SW).

function purgePageCaches(): Promise<void> {
  return Promise.all([caches.delete(APP_DOCUMENT_CACHE), caches.delete(APP_RSC_CACHE)]).then(
    () => undefined,
  );
}

// A brand-new SW build must never serve page documents or RSC payloads that
// an older build cached — that HTML references /_next/static chunk names that
// no longer exist on the new build, so the page loads stale or breaks. The
// precache plugin already cleans up outdated precache caches, but the
// versioned runtime page caches are ours to manage: on activate, wipe every
// page-cache name we don't recognize (i.e. written by an older build).
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => isPageCacheName(name) && name !== APP_DOCUMENT_CACHE && name !== APP_RSC_CACHE)
          .map((name) => caches.delete(name)),
      );
    })().catch(() => undefined),
  );
});

async function notifySessionExpired(): Promise<void> {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    try {
      client.postMessage({ type: "cloudy2:session-expired" });
    } catch {
      // Ignore.
    }
  }
}

function docStorableCheck(request: Request, response: Response) {
  return {
    status: response.status,
    finalUrl: response.url,
    requestUrl: request.url,
    contentType: response.headers.get("content-type"),
    origin: self.location.origin,
  };
}

// Stamp a cached HTML document so the page can show "Saved · HH:MM" (reads
// the cache entry's Date header as cachedAt). Runs on the serve path (via
// `cachedResponseWillBeUsed`); never mutates the stored copy.
async function stampCachedResponse(cachedResponse: Response): Promise<Response> {
  try {
    const dateHeader = cachedResponse.headers.get("date");
    const cachedAt = dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString();
    const text = await cachedResponse.clone().text();
    // Only stamp HTML documents.
    const ct = (cachedResponse.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.includes("text/html")) return cachedResponse;
    const stamped = stampDocument(text, cachedAt);
    const headers = new Headers(cachedResponse.headers);
    // Ensure fresh content-length / remove stale encoding hints from the
    // original response that no longer match the stamped body.
    headers.delete("content-length");
    headers.delete("content-encoding");
    return new Response(stamped, {
      status: cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers,
    });
  } catch {
    return cachedResponse;
  }
}

// The most recently saved document in this build's document cache, or null.
// Shared by the offline fallback and the cold-launch route (which needs the
// saved-at time to decide between instant cached content and the loading
// skeleton). Redirecting (rather than body-swapping a different view under the
// requested URL) keeps the browser URL agreeing with the served page, so the
// served page hydrates cleanly — it already carries the amber OfflineBanner
// and the "Saved · HH:MM" stamp (window.__C2_STAMP__).
async function lastSavedViewEntry(): Promise<SavedViewEntry | null> {
  const cache = await caches.open(APP_DOCUMENT_CACHE);
  const entries: SavedViewEntry[] = [];
  for (const key of await cache.keys()) {
    const response = await cache.match(key).catch(() => null);
    if (!response) continue;
    const dateHeader = response.headers.get("date");
    const parsed = dateHeader ? Date.parse(dateHeader) : NaN;
    entries.push({ url: key.url, savedAtMs: Number.isNaN(parsed) ? null : parsed });
  }
  return newestSavedView(entries);
}

async function lastSavedDocumentUrl(): Promise<string | null> {
  return (await lastSavedViewEntry())?.url ?? null;
}

// The absolute-last-resort offline page: a self-contained branded copy of
// public/offline.html, served only when the precached `/offline.html` is
// unavailable. Keep the markup/styling in sync with public/offline.html — it is
// the canonical source of this UI.
const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<meta name="theme-color" content="#111111" />
<title>Offline — Cloudy</title>
<style>
:root{--navy:#0d47a1;--bg:#111111}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:#e0e0e0;min-height:100dvh;display:flex;flex-direction:column}
header{background:var(--navy);color:#fff;padding:calc(14px + env(safe-area-inset-top,0px)) 16px 14px;display:flex;align-items:center;gap:12px}
header h1{font-size:1.1rem;font-weight:700;letter-spacing:.02em}
main{flex:1;display:flex;align-items:center;justify-content:center;padding:32px 20px 40px}
.card{background:#25262b;border:1px solid #373a40;border-radius:12px;padding:28px 24px;max-width:420px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,.4);text-align:center}
.icon{width:56px;height:56px;margin:0 auto 16px;border-radius:999px;background:#2c2e33;display:grid;place-items:center}
h2{font-size:1.15rem;font-weight:700;margin-bottom:8px;color:#8ca8e2}
p{font-size:.95rem;line-height:1.5;color:#b0b0b0}
p+p{margin-top:10px}
.hint{margin-top:14px;font-size:.82rem;color:#8a8a8a}
.btn{margin-top:18px;display:inline-block;background:var(--navy);color:#fff;font-weight:600;font-size:.95rem;padding:10px 18px;border-radius:8px;text-decoration:none}
</style>
</head>
<body>
<header>
<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M8 18a4 4 0 01-.7-7.92A5.5 5.5 0 0118 8.5 4 4 0 0122 18H8z" fill="#fff" opacity=".95"/><rect x="7" y="11" width="14" height="10" rx="2" fill="#0D47A1" stroke="#fff" stroke-width="1.2"/><path d="M10 11V9M18 11V9M7 14h14" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg>
<h1>Cloudy</h1>
</header>
<main>
<div class="card">
<div class="icon" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F9A825" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1018 0 9 9 0 00-18 0z"/><path d="M8 12h8M12 8v8"/></svg></div>
<h2>You're offline</h2>
<p>Cloudy couldn't reach the server. Reconnect to keep using the app. Once you've opened the app while online, it opens instantly — even offline.</p>
<a class="btn" href="/">Try again</a>
</div>
</main>
</body>
</html>`;

// Offline navigation fallback. When a navigation has neither a cache hit for
// its exact URL nor a working network, redirect to the most recently saved
// view's own URL whenever one exists — for a query-less request (icon tap on
// the start URL, bare F5) it is the obvious intent, and for a deep link with a
// query (?view=…&date=…) that was never visited it is still far more useful
// than a dead end. Redirecting (rather than serving the saved body under the
// requested URL) keeps the browser URL agreeing with the rendered view, so the
// served page hydrates cleanly. Exact-visit deep links resolve from the SWR
// cache before this, and /login is never routed here
// (isCacheableDocumentRequest excludes it). With nothing usable → the branded
// explainer.
async function serveOfflineDocument(request: Request): Promise<Response | undefined> {
  if (request.method === "GET" && request.mode === "navigate") {
    const lastSavedUrl = await lastSavedDocumentUrl().catch(() => null);
    if (lastSavedUrl) return Response.redirect(lastSavedUrl, 302);
  }
  // `offline.html` is precached, but Serwist stores precache entries under a
  // revisioned cache key (…?__WB_REVISION__=<hash>), so a bare
  // `caches.match("/offline.html")` on the plain URL always misses. Resolve the
  // precache key through the serwist instance instead.
  try {
    const fallback = await serwist.matchPrecache("/offline.html");
    if (fallback) return fallback;
    // Absolute last resort: a self-contained branded copy of offline.html,
    // never a bare error string.
    return new Response(OFFLINE_FALLBACK_HTML, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch {
    return undefined;
  }
}

// Plugin that enforces document cacheability, handles session-expiry purging,
// and stamps cached responses so the page can show "Saved · HH:MM".
const documentPlugin = {
  cacheWillUpdate: async ({
    request,
    response,
  }: {
    request: Request;
    response: Response | null;
  }) => {
    if (!response) return null;
    const check = docStorableCheck(request, response);
    if (isSessionExpiredResponse(check)) {
      // Fire-and-forget purge + client notification; don't store the login page
      // under the original document's cache key.
      void purgePageCaches().then(() => notifySessionExpired());
      return null;
    }
    return shouldStoreDocumentResponse(check) ? response : null;
  },
  cachedResponseWillBeUsed: async ({
    cachedResponse,
  }: {
    cachedResponse: Response | null;
  }): Promise<Response | null> => {
    if (!cachedResponse) return null;
    return stampCachedResponse(cachedResponse);
  },
  handlerDidError: async ({ request }: { request: Request }): Promise<Response | undefined> => {
    return serveOfflineDocument(request);
  },
  fetchDidSucceed: async ({
    request,
    response,
  }: {
    request: Request;
    response: Response;
  }): Promise<Response> => {
    // Catch session expiry on the network path as well (StaleWhileRevalidate's
    // background revalidation also goes through fetchDidSucceed before
    // cacheWillUpdate).
    const check = docStorableCheck(request, response);
    if (isSessionExpiredResponse(check)) {
      void purgePageCaches().then(() => notifySessionExpired());
    }
    return response;
  },
} as unknown as import("serwist").SerwistPlugin;

const rscPlugin = {
  cacheWillUpdate: async ({
    request,
    response,
  }: {
    request: Request;
    response: Response | null;
  }) => {
    if (!response) return null;
    const check = docStorableCheck(request, response);
    if (isSessionExpiredResponse(check)) {
      void purgePageCaches().then(() => notifySessionExpired());
      return null;
    }
    return shouldStoreRscResponse(check) ? response : null;
  },
  fetchDidSucceed: async ({
    request,
    response,
  }: {
    request: Request;
    response: Response;
  }): Promise<Response> => {
    const check = docStorableCheck(request, response);
    if (isSessionExpiredResponse(check)) {
      void purgePageCaches().then(() => notifySessionExpired());
    }
    return response;
  },
} as unknown as import("serwist").SerwistPlugin;

// Additional matcher helpers that close over the pure predicates.

function isDocRequest(options: { request: Request; url: URL; sameOrigin: boolean }): boolean {
  if (!options.sameOrigin) return false;
  if (options.request.method !== "GET") return false;
  if (options.request.mode !== "navigate") return false;
  return isCacheableDocumentRequest(options.url, self.location.origin);
}

function isRscRequest(options: { request: Request; url: URL; sameOrigin: boolean }): boolean {
  if (!options.sameOrigin) return false;
  if (options.request.method !== "GET") return false;
  return isCacheableRscRequest(options.url, self.location.origin, options.request.headers);
}

// --- Cold-launch path (start URL `/`) ---
//
// The start URL is never cached (it 307-redirects server-side), so every icon
// tap used to force a serverless round trip before any paint — a cold function
// boot after ~5 min idle is the long Android splash. The SW now handles `/`
// itself (launchDecision in swRules):
// - no saved view → the normal network path (first install / post-deploy wipe);
// - recent saved view → 302 to it (SWR cache hit, no splash, no server call);
// - stale saved view → the precached branded loading skeleton, whose page
//   fetches the real start URL in the background (warming the function + Neon)
//   and replaces with the resolved page. Offline, it falls back to the saved
//   view after a few retries.

// Serve the precached loading.html skeleton with the offline fallback URL
// injected, so the page can redirect to the last-saved view when the network
// fetch fails (offline launch).
async function serveLaunchSkeleton(fallbackUrl: string): Promise<Response | null> {
  try {
    const fallback = await serwist.matchPrecache("/loading.html");
    if (!fallback) return null;
    const text = await fallback.clone().text();
    const injected = text.replace(
      "</head>",
      `<script>window.__C2_LAUNCH__={fallbackUrl:${JSON.stringify(fallbackUrl)}}</script></head>`,
    );
    const headers = new Headers(fallback.headers);
    headers.delete("content-length");
    return new Response(injected, { status: 200, statusText: fallback.statusText, headers });
  } catch {
    return null;
  }
}

// Handle a navigation to the bare start URL. Runs before the document SWR
// route (first-match-wins), so `/` never reaches StaleWhileRevalidate — it is
// never cached anyway.
async function handleLaunchRequest({ request }: { request: Request }): Promise<Response> {
  const saved = await lastSavedViewEntry().catch(() => null);
  const decision = launchDecision(saved, Date.now());
  if (decision === "instant" && saved) {
    // A render happened within the threshold, so the DB can't be cold — the
    // saved view is instant and safe; the SWR route serves it from cache and
    // revalidates in the background.
    return Response.redirect(saved.url, 302);
  }
  if (decision === "skeleton" && saved) {
    const skeleton = await serveLaunchSkeleton(saved.url).catch(() => null);
    if (skeleton) return skeleton;
  }
  // No saved view, or the skeleton is unavailable → today's network path: the
  // server `/` resolves the remembered last page and 307-redirects there. The
  // follow-up navigation goes through the document SWR route as usual.
  try {
    return await fetch(request);
  } catch {
    return (await serveOfflineDocument(request)) ?? new Response(null, { status: 504 });
  }
}

function isLaunchRequest(options: { request: Request; url: URL; sameOrigin: boolean }): boolean {
  if (!options.sameOrigin) return false;
  if (options.request.method !== "GET") return false;
  if (options.request.mode !== "navigate") return false;
  return isStartUrlRequest(options.url);
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Static images and icons — immutable build artifacts, safe to cache.
    {
      matcher: /\.(?:png|jpg|jpeg|gif|svg|webp|ico)$/i,
      handler: new StaleWhileRevalidate({
        cacheName: "static-image-assets",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: 30 * 24 * 60 * 60,
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
    // Fonts — safe to cache for fast cold start.
    {
      matcher: /\.(?:woff2?|ttf|otf|eot|css)$/i,
      handler: new CacheFirst({
        cacheName: "static-style-assets",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 32,
            maxAgeSeconds: 7 * 24 * 60 * 60,
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
    // RSC payloads (soft navigations + prefetches) — stale-while-revalidate so
    // the calendar is instant in-app, including while offline when previously
    // visited. Post-mutation freshness is ensured by the client invalidating
    // the current pathname's entries before router.refresh().
    {
      matcher: isRscRequest,
      handler: new StaleWhileRevalidate({
        cacheName: APP_RSC_CACHE,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: 30 * 24 * 60 * 60,
            maxAgeFrom: "last-used",
            purgeOnQuotaError: true,
          }),
          rscPlugin,
        ],
      }),
    },
    // Cold-launch path (start URL `/`): instant cached view when fresh, the
    // branded loading skeleton when stale, network otherwise. Registered before
    // the document SWR route (first-match-wins) — `/` is never cached anyway.
    {
      matcher: isLaunchRequest,
      handler: handleLaunchRequest,
    },
    // Document navigations (PWA cold open, F5, share link) — the main
    // "instant open" lever. Served instantly from cache when available,
    // revalidated in the background; offline with no cache → redirect to the
    // last-saved view's URL, or offline.html when nothing is saved.
    {
      matcher: isDocRequest,
      handler: new StaleWhileRevalidate({
        cacheName: APP_DOCUMENT_CACHE,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 48,
            maxAgeSeconds: 30 * 24 * 60 * 60,
            maxAgeFrom: "last-used",
            purgeOnQuotaError: true,
          }),
          documentPlugin,
        ],
      }),
    },
    // Everything else (auth, /api, non-GET, and unmatched same-origin) must
    // always hit the network — auth responses must never be cached.
    {
      matcher: ({ sameOrigin }) => sameOrigin,
      handler: new NetworkOnly(),
    },
  ],
});

serwist.addEventListeners();
