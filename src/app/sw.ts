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
  rscCacheName,
  shouldStoreDocumentResponse,
  shouldStoreRscResponse,
  stampDocument,
  swCacheVersion,
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
  },
  handlerDidError: async (): Promise<Response | undefined> => {
    // Offline and no cached document → branded fallback.
    // `offline.html` is expected to be precached (public/offline.html).
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
    // revalidated in the background; offline with no cache → offline.html.
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
