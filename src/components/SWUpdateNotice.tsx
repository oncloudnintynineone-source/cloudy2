"use client";

import { useEffect, useRef } from "react";

import { useActionPill } from "@/components/ActionPill";
import { clearAllSavedPages } from "@/lib/pwa/client";
import {
  shouldPromptForUpdate,
  SW_UPDATE_CHECK_INTERVAL_MS,
  SW_UPDATE_PROMPT_GRACE_MS,
} from "@/lib/pwa/swRules";

/**
 * How long to wait for the new worker to take control after we ask it to skip
 * waiting before reloading anyway. Activation is near-instant once the message
 * lands, so this only covers a missed `controllerchange`.
 */
const RELOAD_TIMEOUT_MS = 3000;

/**
 * Keeps a running page on the latest deployed build.
 *
 * The browser only checks for a new service worker on a navigation or page
 * load, so a long-lived session (a PWA left open all day) never discovers a
 * deploy — the "app not updating automatically" report. This component polls
 * `registration.update()` while visible (plus on `visibilitychange` / `focus` /
 * `online`), and when a new build has installed and is **waiting**, it shows
 * the shared action pill: "New version available — Reload".
 *
 * `src/app/sw.ts` deliberately does not `skipWaiting`, so the old worker keeps
 * serving the old build intact while the pill is up — deferring the reload can
 * never 404 a lazily-loaded chunk. Tapping the pill (or the grace timer
 * expiring) posts `SKIP_WAITING`, and the reload happens on the resulting
 * `controllerchange`, so the tab comes back under the new build.
 *
 * Mounted inside `ActionPillProvider` (see `AppProviders`) so it can reach the
 * pill context.
 */
export function SWUpdateNotice(): null {
  const { show } = useActionPill();

  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const waitingRef = useRef<ServiceWorker | null>(null);
  const promptedRef = useRef(false);
  const applyingRef = useRef(false);
  const graceTimerRef = useRef<number | null>(null);
  const updateCheckInFlightRef = useRef(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
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
      let reloaded = false;
      const reloadNow = () => {
        if (reloaded) return;
        reloaded = true;
        void clearAllSavedPages().then(() => {
          window.location.reload();
        });
      };
      // The waiting worker activates (skipWaiting) and claims this tab, which
      // fires controllerchange — reload then, so the reload runs under the new
      // build. The timeout is only a fallback for a missed event.
      navigator.serviceWorker.addEventListener("controllerchange", reloadNow, { once: true });
      waitingRef.current?.postMessage({ type: "SKIP_WAITING" });
      window.setTimeout(reloadNow, RELOAD_TIMEOUT_MS);
    };

    // `candidate` covers the tick where the worker has reached "installed" but
    // the registration has not yet surfaced it as `waiting`.
    const promptForUpdate = (candidate: ServiceWorker | null) => {
      const waiting = registrationRef.current?.waiting ?? candidate;
      if (
        !shouldPromptForUpdate({
          hasController: navigator.serviceWorker.controller !== null,
          hasWaiting: waiting !== null,
          alreadyPrompted: promptedRef.current,
        })
      ) {
        return;
      }
      promptedRef.current = true;
      waitingRef.current = waiting;
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
    };

    const watchInstalling = (reg: ServiceWorkerRegistration) => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed") promptForUpdate(installing);
      });
    };

    const onUpdateFound = () => {
      const reg = registrationRef.current;
      if (reg) watchInstalling(reg);
    };

    const checkForUpdate = () => {
      const reg = registrationRef.current;
      if (!reg || updateCheckInFlightRef.current) return;
      if (typeof navigator.onLine === "boolean" && !navigator.onLine) return;
      updateCheckInFlightRef.current = true;
      void reg
        .update()
        .catch(() => {})
        .finally(() => {
          updateCheckInFlightRef.current = false;
        });
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };

    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (cancelled || !reg) return;
        registrationRef.current = reg;
        reg.addEventListener("updatefound", onUpdateFound);
        // A worker can already be waiting (e.g. this document was reloaded
        // after the new build installed) — surface it without another event.
        promptForUpdate(reg.waiting);
      })
      .catch(() => {});

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") checkForUpdate();
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
      registrationRef.current?.removeEventListener("updatefound", onUpdateFound);
    };
  }, [show]);

  return null;
}
