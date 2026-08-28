"use client";

import { isPageCacheName } from "./swRules";

/**
 * Names of the page caches currently on disk — matched by prefix, because
 * each service-worker build versions its cache names (a client does not know
 * which version the controlling SW uses).
 */
async function pageCacheNames(): Promise<string[]> {
  const names = await caches.keys();
  return names.filter((name) => isPageCacheName(name));
}

/**
 * Delete cached entries whose URL pathname equals `pathname` in the page
 * caches. Best-effort — never throws. Call before router.refresh() after a
 * mutation so the subsequent RSC/document fetch cannot serve stale data.
 */
export async function invalidatePathCaches(pathname: string): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  const origin = window.location.origin;
  const cacheNames = await pageCacheNames().catch(() => [] as string[]);
  await Promise.all(
    cacheNames.map(async (cacheName) => {
      try {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        await Promise.all(
          keys
            .filter((req) => {
              try {
                const u = new URL(req.url);
                return u.origin === origin && u.pathname === pathname;
              } catch {
                return false;
              }
            })
            .map((req) => cache.delete(req)),
        );
      } catch {
        // Ignore (e.g. quota, SW not ready).
      }
    }),
  );
}

/**
 * Purge all saved page/RSC entries (every build version). Called on sign-out
 * so the next account on this device cannot see the previous user's cached
 * calendar, and when a new SW build takes over so no stale-build entries
 * survive the reload.
 */
export async function clearAllSavedPages(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  const cacheNames = await pageCacheNames().catch(() => [] as string[]);
  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName).catch(() => undefined)));
}

/**
 * Invalidate caches for the current location's pathname (no React hook
 * needed) — convenient for mutation flows that already have `router`.
 */
export async function invalidateCurrentPathCaches(): Promise<void> {
  if (typeof window === "undefined") return;
  await invalidatePathCaches(window.location.pathname);
}

/**
 * Invalidate the current pathname's caches and then call router.refresh().
 * Convenience for mutation flows; avoids repeating the pair at every site.
 */
export async function refreshFresh(
  pathname: string,
  refresh: () => void,
): Promise<void> {
  await invalidatePathCaches(pathname);
  refresh();
}

/** Read the injected staleness stamp if the document was served from cache. */
export function readStaleStamp(): { cachedAt: string } | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { __C2_STAMP__?: { cachedAt: string } };
  const s = w.__C2_STAMP__;
  return s && typeof s.cachedAt === "string" ? s : null;
}
