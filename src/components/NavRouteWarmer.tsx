"use client";

/**
 * Intent-only warm-up of the bottom-nav route chunks. Next prefetches each
 * `<Link>`'s route to its loading boundary, but for dynamic routes that does not
 * include the leaf page's JS chunk. Loading every route at idle downloads pages
 * the user may never open; instead this warms a route's chunk when the user
 * hovers, focuses, or presses its nav link. Connection-gated
 * (`canWarmRoutes`); best-effort and invisible on failure.
 */

import { useEffect, useRef } from "react";

import { canWarmRoutes } from "@/lib/pwa/warmup";

/** Nav base href → the route's client view module (loaded only for that chunk). */
const ROUTE_WARMERS: Record<string, () => Promise<unknown>> = {
  "/parade-state": () => import("@/app/(protected)/parade-state/ParadeStateView"),
  "/contacts": () => import("@/app/(protected)/contacts/ContactList"),
  "/double-booking": () => import("@/app/(protected)/double-booking/DoubleBookingView"),
  "/my-events": () => import("@/app/(protected)/my-events/MyEventsView"),
  "/kah-status": () => import("@/app/(protected)/kah-status/KahStatusView"),
  "/settings": () => import("@/app/(protected)/settings/users/UserTable"),
};

const warmed = new Set<string>();
const inFlight = new Map<string, Promise<unknown>>();

/** Warm one route's leaf chunk. Idempotent; safe to call from intent handlers. */
export function preloadRouteChunk(href: string): void {
  if (!canWarmRoutes() || warmed.has(href) || inFlight.has(href)) {
    return;
  }
  const load = ROUTE_WARMERS[href];
  if (!load) {
    return;
  }
  const promise = load()
    .then(() => {
      warmed.add(href);
    })
    .catch(() => {
      // Best-effort: leave it retryable on the next intent.
    })
    .finally(() => {
      inFlight.delete(href);
    });
  inFlight.set(href, promise);
}

export function NavRouteWarmer({ hrefs }: { hrefs: readonly string[] }) {
  const hrefsRef = useRef(hrefs);
  useEffect(() => {
    hrefsRef.current = hrefs;
  }, [hrefs]);

  useEffect(() => {
    const warmFromEvent = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) {
        return;
      }
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) {
        return;
      }
      const base = hrefsRef.current.find(
        (href) => url.pathname === href || url.pathname.startsWith(`${href}/`),
      );
      if (base) {
        preloadRouteChunk(base);
      }
    };
    document.addEventListener("pointerover", warmFromEvent, { passive: true });
    document.addEventListener("focusin", warmFromEvent);
    document.addEventListener("pointerdown", warmFromEvent, { passive: true });
    document.addEventListener("touchstart", warmFromEvent, { passive: true });
    return () => {
      document.removeEventListener("pointerover", warmFromEvent);
      document.removeEventListener("focusin", warmFromEvent);
      document.removeEventListener("pointerdown", warmFromEvent);
      document.removeEventListener("touchstart", warmFromEvent);
    };
  }, []);

  return null;
}
