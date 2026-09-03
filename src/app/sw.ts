/// <reference lib="esnext" />
 /// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

import {
  documentCacheName,
  isCacheableDocumentRequest,
  isCacheableRscRequest,
  isPageCacheName,
  isSessionExpiredResponse,
  isStartUrlRequest,
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
// Used by the offline fallback (which needs the saved-at time only to pick the
// newest entry). Redirecting (rather than body-swapping a different view under
// the requested URL) keeps the browser URL agreeing with the served page, so
// the served page hydrates cleanly — it already carries the amber OfflineBanner
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

// --- Launch path (start URL `/`) ---
//
// Every icon tap navigates to `/`. Letting that reach the network means the tap
// waits on a serverless cold boot before a single byte arrives (`/` is dynamic:
// it reads the remembered-page cookie and 307s), and Chrome keeps the Android
// splash up until the launched document's first paint — 10s+ when the function
// has scaled to zero. So the SW answers `/` from the precache instead, and the
// shell resolves the remembered page on the client, so `/` never reaches the
// server at all.
//
// This answer is deliberately UNCONDITIONAL, and it must never redirect:
//
// - The runtime page caches are versioned per build and wiped on activate, so
//   any rule keyed on "is there a saved view?" goes inert on the first launches
//   after a deploy — exactly when the function and Neon are coldest. The
//   precache is written at install, so this path is always available.
// - On a cold launch nothing is painted yet: the splash is all that is on
//   screen. A redirect replaces the shell with a *second* navigation, and if
//   that one has to wait on the network the user stares at the splash for the
//   whole cold boot — the exact bug this route exists to kill. Only the shell
//   can guarantee a paint, so the shell is always the answer.
//
// A previous revision peeked at the request's `Cookie` header to 302 straight
// to a still-fresh cached document. That could never work: `Cookie` is a
// forbidden request header, appended by the Fetch standard in the network &
// cache layer *after* service-worker interception, so `request.headers` never
// carries it — and wherever it is leaked, the redirect was the
// nothing-painted path described above.
const LAUNCH_SHELL_URL = "/loading.html";

async function handleLaunchRequest({ request }: { request: Request }): Promise<Response> {
  const shell = await serwist.matchPrecache(LAUNCH_SHELL_URL).catch(() => undefined);
  if (shell) return shell;
  // Precache miss — the very first navigation racing install, or an eviction.
  // Fall back to the server's own `/`, which resolves the same target.
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

// --- Document navigations: cached copy first, at any age ---
//
// A hard navigation (launch target after the shell's redirect, F5, share link)
// serves the cached document the moment one exists — however old — and
// revalidates in the background. The launch must never block on a cold
// serverless round trip.
//
// Staleness is handled *after* paint, not before it: a cached copy is served
// stamped (`stampDocument` → `window.__C2_STAMP__.cachedAt`), the page shows the
// truthful "Saved · HH:MM" chip, and `useStaleDocumentReconcile`
// (src/lib/pwa/client.ts) fires one non-blocking `router.refresh()` when the
// stamp is older than `DOCUMENT_FRESH_WINDOW_MS`. Fresh data therefore arrives
// a beat later rather than in front of a blank screen.
//
// Routing by cache age instead (instant when young, `NetworkFirst` when older)
// was tried and reverted: on the launch path the "older" branch *is* the common
// case — an app reopened after a coffee break is always >5 min stale — and
// because the shell hands off with a real navigation, that wait presented as
// the Android splash sitting through the entire cold boot.
//
// With no cached entry StaleWhileRevalidate is a plain network read (and stores
// the response); when the network *fails* it still falls back to the cache, and
// with both exhausted `handlerDidError` lands on serveOfflineDocument exactly
// as before. Navigation preload means the browser has usually already started
// the request by the time we ask for it.
const documentPlugins = [
  new ExpirationPlugin({
    maxEntries: 48,
    maxAgeSeconds: 30 * 24 * 60 * 60,
    maxAgeFrom: "last-used",
    purgeOnQuotaError: true,
  }),
  documentPlugin,
];

const documentSwr = new StaleWhileRevalidate({
  cacheName: APP_DOCUMENT_CACHE,
  plugins: documentPlugins,
});

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
    // Launch path (start URL `/`): the precached shell, always. Registered
    // before the document route (first-match-wins) — `/` is never cached
    // by that route anyway, since the server only ever 307s from it.
    {
      matcher: isLaunchRequest,
      handler: handleLaunchRequest,
    },
    // Document navigations (launch target after the shell's redirect, F5, share
    // link) — the main "instant open" lever: a cached copy is served at any age
    // and revalidated in the background, with staleness reconciled after paint
    // by the client (§1.5 of docs/pwa-offline.md). Offline with no cache →
    // redirect to the last-saved view's URL, or offline.html when nothing is
    // saved.
    {
      matcher: isDocRequest,
      handler: documentSwr,
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
