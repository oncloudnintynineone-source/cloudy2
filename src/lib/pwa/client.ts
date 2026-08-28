"use client";

import { APP_DOCUMENT_CACHE, APP_RSC_CACHE } from "./swRules";

/**
 * Delete cached entries whose URL pathname equals `pathname` in both page
 * caches. Best-effort — never throws. Call before router.refresh() after a
 * mutation so the subsequent RSC/document fetch cannot serve stale data.
 */
export async function invalidatePathCaches(pathname: string): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  const origin = window.location.origin;
  for (const cacheName of [APP_DOCUMENT_CACHE, APP_RSC_CACHE] as const) {
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
  }
}

/**
 * Purge all saved page/RSC entries. Called on sign-out so the next account
 * on this device cannot see the previous user's cached calendar.
 */
export async function clearAllSavedPages(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  for (const cacheName of [APP_DOCUMENT_CACHE, APP_RSC_CACHE] as const) {
    try {
      await caches.delete(cacheName);
    } catch {
      // Ignore.
    }
  }
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
