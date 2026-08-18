"use client";

import type { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

import { theme } from "@/lib/theme";

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
