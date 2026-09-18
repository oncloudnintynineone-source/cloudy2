"use client";

/**
 * Post-paint warm-up of the bottom-nav route chunks. Next prefetches each
 * `<Link>`'s route to its loading boundary, but for dynamic routes that does not
 * include the leaf page's JS chunk — so the first tap still downloads it. This
 * fetches those leaf chunks at idle so the first switch paints from cache.
 *
 * Connection-gated (`canWarmRoutes`): skipped on metered / very slow / offline
 * links. Best-effort and sequential — a failed warm-up must never surface, and
 * one import at a time avoids a network burst on a phone.
 */

import { useEffect, useRef } from "react";

import { canWarmRoutes } from "@/lib/pwa/warmup";

/** Nav href → the route's client view module (loaded only for that chunk). */
const ROUTE_WARMERS: Record<string, () => Promise<unknown>> = {
  "/parade-state": () => import("@/app/(protected)/parade-state/ParadeStateView"),
  "/contacts": () => import("@/app/(protected)/contacts/ContactList"),
  "/double-booking": () => import("@/app/(protected)/double-booking/DoubleBookingView"),
  "/kah-status": () => import("@/app/(protected)/kah-status/KahStatusView"),
  "/settings": () => import("@/app/(protected)/settings/users/UserTable"),
};

export function NavRouteWarmer({ hrefs }: { hrefs: readonly string[] }) {
  // `hrefs` is a fresh array each render; key the effect on its contents so it
  // schedules once, and read the latest list through a ref at idle time.
  const signature = hrefs.join("|");
  const hrefsRef = useRef(hrefs);
  useEffect(() => {
    hrefsRef.current = hrefs;
  }, [hrefs]);
  const startedRef = useRef(false);

  useEffect(() => {
    const warm = async () => {
      if (startedRef.current || !canWarmRoutes()) return;
      startedRef.current = true;
      for (const href of hrefsRef.current) {
        const load = ROUTE_WARMERS[href];
        if (!load) continue;
        try {
          await load();
        } catch {
          // Best-effort: a failed warm-up is invisible.
        }
      }
    };

    const hasIdle = typeof window.requestIdleCallback === "function";
    let id: number;
    if (hasIdle) {
      id = window.requestIdleCallback(() => void warm(), { timeout: 2000 });
    } else {
      id = window.setTimeout(() => void warm(), 0);
    }
    return () => {
      if (hasIdle) {
        window.cancelIdleCallback(id);
      } else {
        window.clearTimeout(id);
      }
    };
  }, [signature]);

  return null;
}
