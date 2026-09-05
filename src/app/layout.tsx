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
  // Dark grey, matching the Android splash (`manifest.ts`) and the offline
  // page palette for the surfaces Android Chrome still derives bar chrome
  // from — splash, task switcher, and opaque-bar environments. On Android
  // 15+ (edge-to-edge) the system bars are transparent and simply show the
  // fixed header behind them, so the two stay in sync in both color schemes.
  themeColor: "#111111",
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
