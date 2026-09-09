"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { APP_RSC_CACHE_PREFIX, isPageCacheName, needsInactivityRefresh, needsReconcile } from "./swRules";

/**
 * Names of the page caches currently on disk — matched by prefix, because
 * each service-worker build versions its cache names (a client does not know
 * which version the controlling SW uses).
 */
async function pageCacheNames(): Promise<string[]> {
  const names = await caches.keys();
  return names.filter((name) => isPageCacheName(name));
}

/** Delete the entries of `cacheNames` whose URL pathname equals `pathname`. */
async function deletePathEntries(cacheNames: string[], pathname: string): Promise<void> {
  const origin = window.location.origin;
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
 * Delete cached entries whose URL pathname equals `pathname` in the page
 * caches. Best-effort — never throws. Call before router.refresh() after a
 * mutation so the subsequent RSC/document fetch cannot serve stale data.
 */
export async function invalidatePathCaches(pathname: string): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  const cacheNames = await pageCacheNames().catch(() => [] as string[]);
  await deletePathEntries(cacheNames, pathname);
}

/**
 * RSC-only sibling of {@link invalidatePathCaches}. Used by the stale-document
 * reconcile, which must NOT delete the cached *document*: that entry is what
 * makes the next launch instant, and the service worker's own background
 * revalidation already refreshes it. Deleting it would turn every launch after
 * a reconcile back into a network wait.
 */
export async function invalidateRscPathCaches(pathname: string): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  const cacheNames = (await pageCacheNames().catch(() => [] as string[])).filter((name) =>
    name.startsWith(APP_RSC_CACHE_PREFIX),
  );
  await deletePathEntries(cacheNames, pathname);
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

// --- Stale-document reconcile -------------------------------------------------
//
// The service worker serves a cached document instantly at ANY age (§1.5 of
// docs/pwa-offline.md) because a launch must never block on a cold serverless
// round trip — but "instant" must not mean "silently stale". So the page fixes
// it after paint: when the served document carries the SW's `__C2_STAMP__` and
// that stamp is older than DOCUMENT_FRESH_WINDOW_MS, one non-blocking
// `router.refresh()` pulls the current render. The user sees their last-saved
// grid immediately and the live one a beat later, instead of a splash screen
// that waits on the network.

// --- One-shot ?refresh strip ------------------------------------------------
//
// The profile menu's "Force refresh" reloads the current URL with a fresh
// `?refresh=<epoch-ms>` nonce, so the service worker never answers it from the
// document/RSC caches (`ONE_SHOT_PARAMS`) — every page gets a network render,
// and on /dashboard the server additionally force-reads Google. The nonce must
// then leave the URL, or every later soft navigation keeps re-forcing.

// Module scope, not a ref: a full reload resets the module, so one document
// load gets exactly one strip (a `router.replace` does not reload the
// document), and the flag survives React's dev-mode double effect invocation.
let strippedRefreshThisDocument = false;

/**
 * Strip the one-shot `?refresh=` nonce once per document load. Mounted in the
 * protected shell (AppShellShell): on mount, if the URL carries a `refresh`
 * param, clear the pathname's RSC cache entries (so the clean-URL replace
 * below can't be answered by a stale SWR payload — the same trap the dashboard's
 * per-page one-shot strips document) and `router.replace` to the clean URL with
 * no history entry. The cached *document* is deliberately left alone: it is
 * what makes the next launch instant, and this document came off the network
 * anyway (the nonce URL is never stored).
 */
export function useOneShotRefreshStrip(): void {
  const router = useRouter();
  useEffect(() => {
    if (strippedRefreshThisDocument) return;
    let url: URL;
    try {
      url = new URL(window.location.href);
    } catch {
      return;
    }
    if (!url.searchParams.has("refresh")) return;
    strippedRefreshThisDocument = true;
    url.searchParams.delete("refresh");
    const clean = `${url.pathname}${url.search}`;
    const pathname = url.pathname;
    void invalidateRscPathCaches(pathname).then(() => {
      router.replace(clean, { scroll: false });
    });
  }, [router]);
}

/** Window event dispatched when a stale cached document starts reconciling. */
export const DOCUMENT_RECONCILED_EVENT = "cloudy2:document-reconciled";

/** Wait out hydration + the launch's own work before touching the network. */
const RECONCILE_DELAY_MS = 1500;

interface StampedWindow {
  __C2_STAMP__?: { cachedAt?: unknown };
}

/**
 * The `cachedAt` the service worker injected into the served document
 * (`stampDocument`), or null when the document came off the network — the SW
 * stamps cache hits only, so no stamp means already fresh.
 */
export function documentCachedAtIso(): string | null {
  if (typeof window === "undefined") return null;
  const cachedAt = (window as StampedWindow).__C2_STAMP__?.cachedAt;
  if (typeof cachedAt !== "string") return null;
  return Number.isNaN(Date.parse(cachedAt)) ? null : cachedAt;
}

// Module scope, not a ref: a document load gets exactly one reconcile, and a
// refresh does not reload the document, so the flag survives the refresh itself
// (and React's dev-mode double effect invocation).
let reconciledThisDocument = false;

/**
 * Reconcile a stale cached document once per document load. Mounted once in
 * `AppProviders`, so every page under the root layout is covered; pages served
 * straight from the network have no stamp and do nothing.
 */
export function useStaleDocumentReconcile(): void {
  const router = useRouter();
  useEffect(() => {
    if (reconciledThisDocument) return;
    if (!needsReconcile(documentCachedAtIso(), Date.now())) return;
    reconciledThisDocument = true;
    // No cleanup on purpose: the flag above means a re-run (or React's
    // dev-mode double invocation) would clear the only scheduled reconcile and
    // then refuse to schedule another. `AppProviders` lives exactly as long as
    // the document, which is the window this fires in.
    setTimeout(() => {
      void invalidateRscPathCaches(window.location.pathname).then(() => {
        window.dispatchEvent(new Event(DOCUMENT_RECONCILED_EVENT));
        router.refresh();
      });
    }, RECONCILE_DELAY_MS);
  }, [router]);
}

// --- Inactivity refresh ----------------------------------------------------
//
// A tab left in the background never reconciles (the reconcile above is a
// once-per-document-load affair, and navigation-driven refreshes only run when
// the user navigates). So a backgrounded PWA can sit stale for hours: the
// server's event cache has long expired, and any deploy that landed meanwhile
// never reached the tab. This hook remembers when the document went hidden and,
// when it becomes visible again after more than INACTIVITY_REFRESH_MS, pulls
// fresh data — a soft, non-destructive `router.refresh()` that clears only the
// RSC entries (the cached *document* is preserved for instant launch, matching
// the reconcile). Actively reading the timestamp instead of a timer matters:
// background tabs freeze timers, but they still fire `visibilitychange`.
// The deploy side is handled separately (useSWUpdateReload triggers a SW
// update() on the same transition).

// Module scope, not a ref: the hidden timestamp only ever means "the instant
// this document most recently went hidden", and a document load resets it — so
// one value scopes cleanly to one document's lifetime (and React's dev-mode
// double effect invocation cannot double-count it).
let lastHiddenAt = 0;

/**
 * Refresh the current route when the tab returns to the foreground after being
 * hidden longer than `INACTIVITY_REFRESH_MS`. Mounted once in `AppShellShell`
 * (protected routes only), so every authenticated page is covered and `/login`
 * — plus the pre-JS browser gate — is untouched. A quick app-switch (hidden for
 * less than the window) keeps the in-memory render; longer absences pull fresh
 * RSC without a full reload (scroll/state preserved).
 */
export function useInactivityRefresh(): void {
  const router = useRouter();
  useEffect(() => {
    if (document.visibilityState === "hidden") lastHiddenAt = Date.now();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        lastHiddenAt = Date.now();
        return;
      }
      const hiddenAt = lastHiddenAt;
      lastHiddenAt = 0;
      if (hiddenAt === 0) return;
      if (!needsInactivityRefresh(Date.now() - hiddenAt)) return;
      void invalidateRscPathCaches(window.location.pathname).then(() => router.refresh());
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);
}
