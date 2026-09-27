"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useReportActivity } from "@/components/ActivityBar";
import { invalidateRscPathCaches } from "@/lib/pwa/client";
import { LIVE_REFRESH_EVENT, needsLiveRefresh } from "./liveRefreshRules";

/**
 * Always-fresh-route revalidation for the audit log (see
 * `src/lib/pwa/swRules.ts` `isAlwaysFreshPath` and `docs/audit-log.md`).
 *
 * Next's client Router Cache (`staleTimes.dynamic = 120`) and the SWR RSC cache
 * can replay an old payload for a visited URL, so the page can finish its
 * loading state with stale rows. This hook compares the payload's server
 * `renderedAt` against the client clock and, when it is a replay, forces one
 * live re-read (`invalidateRscPathCaches` → `router.refresh()`) — reported on
 * the activity bar and surfaced by the caller as its list skeleton. It also
 * listens for the header Force refresh's soft-path event
 * (`LIVE_REFRESH_EVENT`, dispatched by `AppShellShell`) so that button
 * re-reads the route in place instead of a full document reload.
 *
 * Returns whether a live read is in flight (so the caller shows its skeleton).
 */
export function useLiveRouteRefresh(renderedAt: number): boolean {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  // A synchronous "we just asked for a fresh read" flag, so the skeleton can
  // replace stale rows before paint (isPending only flips after the async cache
  // invalidation resolves).
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);
  const started = useRef(false);
  // The renderedAt we have already re-read. Prevents an unrelated re-render from
  // re-triggering while the same (stale) payload is still mounted.
  const attempted = useRef<number | null>(null);

  useReportActivity(busy || isPending, "route:live");

  const refresh = useCallback(() => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    void invalidateRscPathCaches(pathname)
      .then(() => {
        startTransition(() => router.refresh());
      })
      .catch(() => {
        inflight.current = false;
        setBusy(false);
      });
  }, [pathname, router, startTransition]);

  // Freshness gate: force one live read when the payload is a cache replay. A
  // *layout* effect so the skeleton lands before the stale rows paint.
  useLayoutEffect(() => {
    if (attempted.current === renderedAt) return;
    if (!needsLiveRefresh(renderedAt, Date.now())) return;
    attempted.current = renderedAt;
    refresh();
  }, [renderedAt, refresh]);

  // Clear the skeleton once the forced refresh transition settles.
  useEffect(() => {
    if (isPending) {
      started.current = true;
      return;
    }
    if (started.current) {
      started.current = false;
      inflight.current = false;
      setBusy(false);
    }
  }, [isPending]);

  // Header Force refresh, soft path.
  useEffect(() => {
    const onForce = () => refresh();
    window.addEventListener(LIVE_REFRESH_EVENT, onForce);
    return () => window.removeEventListener(LIVE_REFRESH_EVENT, onForce);
  }, [refresh]);

  return busy || isPending;
}
