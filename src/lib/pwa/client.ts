"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useTransition } from "react";

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
 * Remove the current URL's one-shot `?refresh` nonce: clear the pathname's RSC
 * cache entries first (so the clean-URL `router.replace` can't be answered by a
 * stale SWR payload — the same trap the dashboard's per-page one-shot strips
 * document) and `router.replace` to the clean URL with no history entry. The
 * cached *document* is deliberately left alone: it is what makes the next
 * launch instant, and the nonce URL is never stored by the SW anyway. Shared by
 * the mount-time strip (`useOneShotRefreshStrip`) and the inactivity refresh's
 * post-commit strip.
 */
function stripRefreshNonce(router: ReturnType<typeof useRouter>): void {
  let url: URL;
  try {
    url = new URL(window.location.href);
  } catch {
    return;
  }
  if (!url.searchParams.has("refresh")) return;
  url.searchParams.delete("refresh");
  const clean = `${url.pathname}${url.search}`;
  void invalidateRscPathCaches(url.pathname).then(() => {
    router.replace(clean, { scroll: false });
  });
}

/**
 * Strip the one-shot `?refresh=` nonce once per document load. Mounted in the
 * protected shell (AppShellShell): on mount, if the URL carries a `refresh`
 * param, clear the pathname's RSC cache entries and `router.replace` to the
 * clean URL. A nonce that arrives *mid-document* (the inactivity refresh's soft
 * navigation) is stripped by that hook itself — this effect runs once per mount
 * (`[router]`), so it never races the reload-less URL change.
 */
export function useOneShotRefreshStrip(): void {
  const router = useRouter();
  useEffect(() => {
    if (strippedRefreshThisDocument) return;
    let hasNonce = false;
    try {
      hasNonce = new URL(window.location.href).searchParams.has("refresh");
    } catch {
      return;
    }
    if (!hasNonce) return;
    strippedRefreshThisDocument = true;
    stripRefreshNonce(router);
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
// when it becomes visible again after more than INACTIVITY_REFRESH_MS, drives
// the same one-shot `?refresh` force-read the header's Force refresh uses — a
// soft `router.replace` to a `?refresh=<now>` URL, so the dashboard's server
// read bypasses its cache freshness window and blocks on fresh Google data
// (page.tsx), then strips the nonce once the forced render commits (the URL
// must not linger: the SW never caches it and it would re-force every later
// refresh within its TTL). A bare `router.refresh()` would be useless here —
// after 5 min hidden the events cache is stale-but-usable (60 s fresh / 30 min
// expire), so a plain re-read returns the same grid. Actively reading the
// timestamp instead of a timer matters: background tabs freeze timers, but they
// still fire `visibilitychange` (and a bfcache restore fires `pageshow` with
// `event.persisted`, and a window regains `focus` — all three are listened for,
// since some platforms skip the visibility transition entirely).
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
 * RSC without a full reload (scroll/state preserved). Returns the forced-refresh
 * navigation's transition pending flag so the shell can report it on the shared
 * activity bar (a same-path soft navigation has no skeleton of its own).
 */
export function useInactivityRefresh(): boolean {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Set once a forced-refresh navigation is kicked off; when its transition
  // commits (isPending drops) the `?refresh` nonce is stripped so it can't keep
  // re-forcing later refreshes. Only this hook's own navigation sets it, so an
  // unrelated transition can never strip early.
  const stripAfterNav = useRef(false);

  useEffect(() => {
    if (stripAfterNav.current && !isPending) {
      stripAfterNav.current = false;
      stripRefreshNonce(router);
    }
  }, [isPending, router]);

  const onReturn = useCallback(() => {
    const hiddenAt = lastHiddenAt;
    lastHiddenAt = 0;
    if (hiddenAt === 0) return;
    if (!needsInactivityRefresh(Date.now() - hiddenAt)) return;
    let url: URL;
    try {
      url = new URL(window.location.href);
    } catch {
      return;
    }
    url.searchParams.set("refresh", String(Date.now()));
    stripAfterNav.current = true;
    startTransition(() => {
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    });
  }, [router, startTransition]);

  useEffect(() => {
    if (document.visibilityState === "hidden") lastHiddenAt = Date.now();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        lastHiddenAt = Date.now();
        return;
      }
      onReturn();
    };
    // A window can lose focus without the document going hidden (alt-tab, a
    // second monitor, an overlay window), and some WebViews background without
    // `visibilitychange` at all — so `blur` records the absence and `focus`
    // (like a bfcache-restoring `pageshow` with `event.persisted`) is a return
    // signal. All three route through the same idempotent check: `onReturn`
    // zeroes `lastHiddenAt`, so whichever fires first wins and the rest no-op.
    const onBlur = () => {
      lastHiddenAt = Date.now();
    };
    const onFocus = () => {
      onReturn();
    };
    const onPageshow = (event: PageTransitionEvent) => {
      if (event.persisted) onReturn();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageshow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageshow);
    };
  }, [onReturn]);

  return isPending;
}
