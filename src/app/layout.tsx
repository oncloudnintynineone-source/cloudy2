import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/schedule/styles.css";
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
  // Brand navy: the Android status bar (top) is tinted with `theme-color`,
  // matching the always-navy AppShell header behind it in both color schemes
  // (and the edge-to-edge transparent bar on Android 15+). The bottom
  // navigation bar is not set here — it follows the page's `color-scheme`
  // (black in dark mode, white in light), which Mantine resolves per theme.
  themeColor: "#0D47A1",
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
          <SerwistProvider swUrl="/serwist/sw.js">{children}</SerwistProvider>
        </AppProviders>
      </body>
    </html>
  );
}
