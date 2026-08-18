import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/schedule/styles.css";
import "@mantine/notifications/styles.css";

import type { Metadata, Viewport } from "next";
import { ColorSchemeScript, mantineHtmlProps, MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { SerwistProvider } from "@serwist/turbopack/react";

import { theme } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Cloudy",
  description: "Cloud Calendar Movement",
  applicationName: "Cloudy",
  manifest: "/manifest.webmanifest",
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
  themeColor: "#0D47A1",
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
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <Notifications />
          <SerwistProvider swUrl="/serwist/sw.js">{children}</SerwistProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
