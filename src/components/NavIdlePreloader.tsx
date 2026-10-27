"use client";

/**
 * Idle bulk warm of the three high-traffic nav pages (Parade State, Contacts,
 * Double Booking). Next `<Link>` prefetch only reaches each route's loading
 * boundary, so on tap these pages still paid a server render plus a leaf-chunk
 * download. Once the cold start has landed, this runs one pass per signed-in
 * user at idle on capable devices (`canPreloadTabs`): `router.prefetch` on each
 * base href runs the page's server render — warming the config cache and the
 * cache-backed month read — and lands the payload in the router + RSC caches,
 * while `preloadRouteChunk` warms the leaf chunk. A tap after the pass paints
 * from the warm caches with no round trip.
 *
 * Deliberately once per session (not per anchor month): re-running it on every
 * month step multiplied the background work exactly when the user was waiting
 * on a new month's read. Bare base hrefs only: one-shot params (`?refresh` …)
 * must never enter a cache key (docs/pwa-offline.md §1.11). Double Booking's
 * scan itself stays covered by the shell's nav-badge read
 * (`AppShellShell.tsx`), not a second fetch here. Best-effort and invisible on
 * failure.
 */

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useColdStartReady } from "@/components/ColdStartReady";
import { preloadRouteChunk } from "@/components/NavRouteWarmer";
import {
  NAV_PRELOAD_HREFS,
  navPreloadSignature,
  planNavPreload,
} from "@/lib/navPreload/navPreload";
import { canPreloadTabs } from "@/lib/pwa/warmup";

export function NavIdlePreloader({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { phase } = useColdStartReady();
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    if (phase !== "done") {
      return;
    }
    const signature = navPreloadSignature(userId);
    if (planNavPreload(seenRef.current, signature) === null) {
      return;
    }

    const run = () => {
      // Capability is checked at idle time, not at schedule time: a link that
      // turned slow or offline in between should not pay the cost anyway.
      if (!canPreloadTabs()) {
        return;
      }
      seenRef.current.add(signature);
      for (const href of NAV_PRELOAD_HREFS) {
        if (href === pathname) {
          continue; // already mounted — nothing to warm
        }
        router.prefetch(href);
        preloadRouteChunk(href);
      }
    };

    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(run, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 0);
    return () => window.clearTimeout(id);
  }, [phase, userId, pathname, router]);

  return null;
}
