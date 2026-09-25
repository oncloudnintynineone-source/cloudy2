import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import { SerwistProvider } from "@serwist/turbopack/react";

import AppProviders from "@/components/AppProviders";

export const metadata: Metadata = {
  title: "Cloudy2",
  description: "Cloud Calendar Movement",
  applicationName: "Cloudy2",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cloudy2",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  // The Android status bar's `theme-color` is deliberately NOT declared here:
  // `SystemBarSync` renders it instead, so the node can be remounted through
  // React (needed to make Chrome re-read the status bar at cold launch) without
  // detaching a React-metadata-owned node — which crashed React. That
  // component's SSR output is the pre-hydration meta; `manifest.ts`
  // (`theme_color`) carries the matching neutral dark for the PWA splash/status
  // bar (the page's scheme-aware meta refines it to the header tone).
  // The bottom navigation bar is not set here either — it follows the page's
  // `color-scheme` (black in dark mode, white in light), which Mantine resolves
  // per theme.
  // Declare the page supports both schemes before CSS loads so the Android
  // navigation bar resolves to the right black/white as early as possible
  // (Mantine's `color-scheme` on :root takes over once its CSS parses).
  colorScheme: "light dark",
  // Makes env(safe-area-inset-*) report real values on notched devices so
  // the header/bottom-nav/FAB clearance vars actually engage in the
  // standalone PWA (they evaluate to 0 without it).
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body>
        <AppProviders>
          {/* `updateViaCache: "none"` makes the browser revalidate the worker
              script against the network on every update check instead of
              trusting its HTTP cache — the difference between discovering a
              deploy and staying on the old build (iOS/Safari especially).
              Complements the no-cache headers set for /serwist/* in
              next.config.ts.
              `reloadOnOnline={false}`: Serwist defaults it to true, which
              hard-reloads the page on every `online` event — a surprise on
              flaky mobile connections, and redundant with the app's own
              `useInactivityRefresh` / `SWUpdateNotice` refresh paths. */}
          <SerwistProvider
            swUrl="/serwist/sw.js"
            options={{ updateViaCache: "none" }}
            reloadOnOnline={false}
          >
            {children}
          </SerwistProvider>
        </AppProviders>
      </body>
    </html>
  );
}
