"use client";

import { useEffect, type ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { useMediaQuery } from "@mantine/hooks";

import { OfflineBanner } from "@/components/OfflineBanner";
import { clearAllSavedPages, useStaleDocumentReconcile } from "@/lib/pwa/client";
import { DESKTOP_MEDIA_QUERY, theme } from "@/lib/theme";

function useSWUpdateReload() {
  // When a new service-worker build activates (post-deploy) and takes over
  // this tab, the running page is the old build: its HTML references
  // /_next/static chunk names that no longer exist, so continuing in place
  // shows stale (or broken) UI. The new SW wipes older page caches on
  // activate; we additionally clear from the client (covers the brief
  // activate/claim race) and reload so the tab runs the new build.
  //
  // The SW file lives at a fixed URL, so detect the swap by ServiceWorker
  // object identity, not scriptURL. The first-ever claim (controller was
  // null) must NOT reload — that is a normal initial install.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let lastController = navigator.serviceWorker.controller;
    const handleChange = () => {
      const current = navigator.serviceWorker.controller;
      const wasControlled = lastController !== null;
      lastController = current;
      if (!wasControlled || current === null) return;
      void clearAllSavedPages().then(() => {
        window.location.reload();
      });
    };
    navigator.serviceWorker.addEventListener("controllerchange", handleChange);
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", handleChange);
  }, []);

  // The browser only checks for a new SW (and therefore a deploy) on a
  // navigation or page load. A backgrounded PWA does neither, so a deploy that
  // lands while the app sits idle leaves the old build running — and when the
  // user returns, the old build's in-flight RSC / `/_next/static` chunk
  // requests hit hashes that 404 against the new deploy, presenting as a stuck
  // (infinite) load. Trigger a manual `update()` when the tab regains
  // visibility: if a new build exists, `skipWaiting` + `clientsClaim` fire
  // `controllerchange` and the reload handler above takes over; otherwise the
  // check is a cheap no-op.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.update())
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
}

function useSessionExpiryRedirect() {
  // The SW posts this when a background revalidation lands on /login
  // (session expired on a cached device). Purge is already done in the SW —
  // here we just leave the stale page.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "cloudy2:session-expired") {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/login");
      }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handler as EventListener);
      return () =>
        navigator.serviceWorker.removeEventListener("message", handler as EventListener);
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);
}

// React 19.2 warns when a `<script>` element is rendered inside a React
// component on the client. Mantine's `ColorSchemeScript` (root layout `<head>`)
// renders exactly that, and Next 16.2+ re-renders the head during soft
// navigation — so the warning fires on every page change. It is a known false
// positive (cf. shadcn-ui/ui#10104, next-themes#387): the script only needs to
// run once, server-side, to set `data-mantine-color-scheme` before paint, and
// it does. The warning is dev-only (production React omits the check), so
// filter just that one message in development to keep the console clean.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Encountered a script tag while rendering React component")
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

/**
 * Client-side provider wrapper: the theme contains function values
 * (`components.Input.vars`), which cannot cross the server → client
 * component boundary, so MantineProvider must mount on the client.
 */
export default function AppProviders({ children }: { children: ReactNode }) {
  // A deployed SW build took over this tab — clear stale page caches and
  // reload under the new build.
  useSWUpdateReload();
  // A cached document is always served instantly, so a stale one reconciles
  // itself against the network right after paint (docs/pwa-offline.md §1.5).
  useStaleDocumentReconcile();
  // If the SW detected a session expiry while revalidating a cached page,
  // leave the stale view for /login — the caches are already purged in the SW.
  useSessionExpiryRedirect();
  // Toasts default to the bottom-right corner, which is exactly where the
  // FloatingToolbar FABs sit on mobile (both portaled to <body>) — a success
  // toast would cover the button the user just tapped. Mobile gets
  // top-center instead; desktop has no FABs, so bottom-right stays.
  // `useMediaQuery` resolves after mount, before any notification exists.
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position={isDesktop ? "bottom-right" : "top-center"} />
      <OfflineBanner />
      {children}
    </MantineProvider>
  );
}
