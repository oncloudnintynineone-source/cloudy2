"use client";

import { useEffect } from "react";

import { maybeDispatchParadeEmail } from "./actions";

// Wait out the launch's own work before the lazy tick's round trip.
const INITIAL_TICK_DELAY_MS = 3000;
// Focus/visibility can fire in bursts; one ping per window per document is
// plenty because the send is idempotent and cheap to re-check server-side.
const TICK_THROTTLE_MS = 5 * 60 * 1000;

// Module scope, not a ref: a document load gets a clean throttle window and
// React's dev-mode double effect invocation cannot double-count it.
let lastTickAt = 0;

/**
 * Lazy trigger for the daily parade-state email. Mounted once in the protected
 * shell, so any authenticated activity — the initial app open and every
 * return-from-background (focus/visibility) — can fire the send once the
 * configured window is open. The server action is idempotent (unique
 * `send_date`), so multiple devices/users racing is harmless. Best-effort:
 * offline or failed calls are ignored.
 */
export function useParadeEmailTick(): void {
  useEffect(() => {
    const tick = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return;
      }
      const now = Date.now();
      if (now - lastTickAt < TICK_THROTTLE_MS) {
        return;
      }
      lastTickAt = now;
      void maybeDispatchParadeEmail().catch(() => {});
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
