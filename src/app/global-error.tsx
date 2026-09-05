"use client";

import "@mantine/core/styles.css";

import { MantineProvider, mantineHtmlProps } from "@mantine/core";
import { useEffect } from "react";

import { ErrorState } from "@/components/ErrorState";
import { theme } from "@/lib/theme";

/**
 * Last-resort boundary: replaces the entire root layout (including <html>),
 * so it must render its own document shell and re-mount MantineProvider.
 * Uses the same theme object; `defaultColorScheme="auto"` matches the app.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[cloudy2] global error", error);
  }, [error]);

  return (
    <html lang="en" {...mantineHtmlProps}>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <ErrorState
            title="Cloudy2 hit a problem"
            description="An unexpected error occurred. Reloading the page usually fixes it — your data is unaffected."
            onReset={() => reset()}
          />
        </MantineProvider>
      </body>
    </html>
  );
}
