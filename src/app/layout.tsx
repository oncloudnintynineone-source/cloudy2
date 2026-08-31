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
  title: "Cloudy",
  description: "Cloud Calendar Movement",
  applicationName: "Cloudy",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cloudy",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  // Android Chrome (standalone PWA) tints the status/navigation bars from the
  // theme color — the per-page meta tag overrides the manifest's single
  // `theme_color`. Scheme-aware variants keep the bars matching the bottom
  // nav (`var(--mantine-color-body)`: white in light, Mantine dark-7 in dark;
  // the app uses `defaultColorScheme="auto"`, so prefers-color-scheme stays
  // in sync with Mantine's scheme).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1b1e" },
  ],
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
