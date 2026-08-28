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
// the cache entry's Date header as cachedAt). Shared by the serve path and
// the offline fallback; never mutates the stored copy.
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

// The most recently saved document in this build's document cache, stamped for
// serving. Used as the offline fallback for query-less navigations (icon tap
// on the start URL, bare F5): their cache key may never have been filled
// (e.g. the user always deep-links), but some saved view almost always exists
// and beats the offline page. The original (un-stamped) copy is re-stored
// under the requested URL so repeat offline opens of it are stable; serves
// stamp on the way out, and `stampDocument` stays idempotent either way.
async function lastSavedDocument(request: Request): Promise<Response | null> {
  const cache = await caches.open(APP_DOCUMENT_CACHE);
  const byUrl = new Map<string, Request>();
  const entries: SavedViewEntry[] = [];
  for (const key of await cache.keys()) {
    const response = await cache.match(key).catch(() => null);
    if (!response) continue;
    byUrl.set(key.url, key);
    const dateHeader = response.headers.get("date");
    const parsed = dateHeader ? Date.parse(dateHeader) : NaN;
    entries.push({ url: key.url, savedAtMs: Number.isNaN(parsed) ? null : parsed });
  }
  const newest = newestSavedView(entries);
  const keyRequest = newest ? byUrl.get(newest.url) : undefined;
  if (!keyRequest) return null;
  const response = await cache.match(keyRequest);
  if (!response) return null;
  await cache.put(request, response.clone()).catch(() => undefined);
  return stampCachedResponse(response);
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
    // Offline and no cached document for this exact URL. A query-less request
    // is a page-level intent (icon tap on the start URL, bare F5) — serve the
    // most recently saved view with its stamp instead of a dead end. A query
    // carries a specific view intent (?view=…&date=…), so silently swapping in
    // a different view would mislead; offer the saved-views picker instead.
    let hasQuery = true;
    try {
      hasQuery = new URL(request.url).search !== "";
    } catch {
      // Unparseable — keep the picker (safer default).
    }
    if (request.method === "GET" && request.mode === "navigate" && !hasQuery) {
      const lastSaved = await lastSavedDocument(request).catch(() => null);
      if (lastSaved) return lastSaved;
    }
    // Offline and nothing usable → branded fallback, which lists saved views
    // when any exist. `offline.html` is expected to be precached.
    try {
      const fallback = await caches.match("/offline.html");
      if (fallback) return fallback;
      // As a last resort, fall back to a minimal inline response.
      return new Response(
        "<!doctype html><title>Offline — Cloudy</title><meta name=viewport content='width=device-width,initial-scale=1'><body style='font-family:system-ui;padding:2rem;text-align:center'><h1>You're offline</h1><p>Connect to view the calendar.</p></body>",
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    } catch {
      return undefined;
    }
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
          }),
          rscPlugin,
        ],
      }),
    },
    // Document navigations (PWA cold open, F5, share link) — the main
    // "instant open" lever. Served instantly from cache when available,
    // revalidated in the background; offline with no cache → last-saved view
    // (query-less) or the saved-views picker page (query; docs/pwa-offline.md §1.9).
    {
      matcher: isDocRequest,
      handler: new StaleWhileRevalidate({
        cacheName: APP_DOCUMENT_CACHE,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 48,
            maxAgeSeconds: 30 * 24 * 60 * 60,
            maxAgeFrom: "last-used",
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
