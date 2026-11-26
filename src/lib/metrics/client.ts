"use client";

import { useEffect } from "react";

import { METRICS_TICK_THROTTLE_MS } from "@/lib/metrics/config";
import { postJson } from "@/lib/api/client";

// Wait out the launch's own work — the tick must never compete with the
// dashboard's first paint or its cold reads.
const INITIAL_TICK_DELAY_MS = 6000;

// Module scope, not a ref: a document load gets a clean throttle window, and
// React's dev-mode double effect invocation cannot double-count it.
let lastTickAt = 0;

/**
 * Lazy trigger for the daily resource-usage snapshot. Mounted once in the
 * protected shell beside `useParadeEmailTick`, so any authenticated activity —
 * app open and every return-from-background — can close the ledger once the
 * configured window is open. The server side is idempotent (a unique
 * `(kind, day)` claim), so devices and instances racing is harmless, and the
 * window gate runs before any ledger read. Best-effort: offline or failed
 * pings are ignored.
 */
export function useMetricsTick(): void {
  useEffect(() => {
    const tick = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return;
      }
      const now = Date.now();
      if (now - lastTickAt < METRICS_TICK_THROTTLE_MS) {
        return;
      }
      lastTickAt = now;
      // Route handler, not a server action: Next serializes server actions
      // client-side, and an opportunistic tick must never queue ahead of the
      // user's next save or calendar read.
      void postJson("/api/metrics/tick", {}).catch(() => {});
    };

    const timer = window.setTimeout(tick, INITIAL_TICK_DELAY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
}
