"use client";

import { useEffect, useRef } from "react";

import { useActionPill } from "@/components/ActionPill";
import { APP_VERSION } from "@/lib/appVersion";
import { clearAllSavedPages } from "@/lib/pwa/client";
import {
  shouldPromptForUpdate,
  SW_UPDATE_CHECK_INTERVAL_MS,
  SW_UPDATE_PROMPT_GRACE_MS,
} from "@/lib/pwa/swRules";

interface VersionResponse {
  version?: unknown;
}

/**
 * Keeps a running page on the latest deployed build.
 *
 * The browser only checks for a new service worker on a navigation or page
 * load, so a long-lived session (a PWA left open all day) never discovers a
 * deploy. This component polls `GET /api/version` while visible (plus on
 * `visibilitychange` / `focus` / `online`) and compares the server's build
 * with the `APP_VERSION` baked into this page's bundle: a mismatch means this
 * page is stale, and it shows the shared action pill
 * ("New version available — Reload").
 *
 * Detection is deliberately **not** the service worker's `registration.waiting`
 * state. On iOS Safari a waiting worker can linger — and keep being reported —
 * after the new build is already running, which made the pill reappear after
 * every reload the user tapped. Comparing live server/client versions is
 * authoritative, so a stuck worker can never re-prompt a page that is current.
 *
 * Applying the update clears the page caches, drops the service-worker
 * registration (a stuck waiting worker would otherwise keep serving the old
 * precache), and reloads — `SerwistProvider` then installs the current build's
 * worker from a clean slate.
 *
 * Mounted inside `ActionPillProvider` (see `AppProviders`) so it can reach the
 * pill context.
 */
export function SWUpdateNotice(): null {
  const { show } = useActionPill();

  const promptedForRef = useRef<string | null>(null);
  const applyingRef = useRef(false);
  const graceTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const clearGraceTimer = () => {
      if (graceTimerRef.current !== null) {
        window.clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    };

    const applyUpdate = () => {
      if (applyingRef.current) return;
      applyingRef.current = true;
      clearGraceTimer();
      void (async () => {
        try {
          await clearAllSavedPages();
        } catch {
          // Best effort — never block the reload.
        }
        try {
          const registration = await navigator.serviceWorker?.getRegistration();
          await registration?.unregister();
        } catch {
          // Best effort.
        }
        window.location.reload();
      })();
    };

    const checkVersion = async () => {
      if (inFlightRef.current) return;
      if (typeof navigator.onLine === "boolean" && !navigator.onLine) return;
      inFlightRef.current = true;
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as VersionResponse;
        const serverVersion = typeof data.version === "string" ? data.version : null;
        if (cancelled || serverVersion === null) return;
        // Back on the current build (the reload landed): allow a future deploy
        // to prompt again.
        if (serverVersion === APP_VERSION) {
          promptedForRef.current = null;
          return;
        }
        if (
          !shouldPromptForUpdate({
            clientVersion: APP_VERSION,
            serverVersion,
            alreadyPrompted: promptedForRef.current === serverVersion,
          })
        ) {
          return;
        }
        promptedForRef.current = serverVersion;
        show({
          title: "New version available",
          label: "Reload",
          // "fill" sweeps once over the grace window, then persists until
          // actioned — the sweep is the warned countdown to the auto-apply.
          direction: "fill",
          duration: SW_UPDATE_PROMPT_GRACE_MS,
          onAction: applyUpdate,
        });
        clearGraceTimer();
        graceTimerRef.current = window.setTimeout(applyUpdate, SW_UPDATE_PROMPT_GRACE_MS);
      } catch {
        // Offline or transient — retry on the next trigger.
      } finally {
        inFlightRef.current = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };

    void checkVersion();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkVersion();
    }, SW_UPDATE_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      clearGraceTimer();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [show]);

  return null;
}
