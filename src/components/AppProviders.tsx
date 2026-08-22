"use client";

import type { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

import { theme } from "@/lib/theme";

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
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications />
      {children}
    </MantineProvider>
  );
}
