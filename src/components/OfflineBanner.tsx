"use client";

import { useEffect, useState } from "react";
import { Box, Text } from "@mantine/core";

/**
 * Full-width amber strip pinned to the viewport top whenever the browser
 * reports offline. Mounted once (in AppProviders) so it covers every route,
 * including /login and error fallbacks. Starts hidden and flips in an effect
 * to avoid a hydration mismatch with `navigator.onLine`.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <Box
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: "0 0 auto 0",
        zIndex: 400,
        background: "var(--mantine-color-accent-6)",
        color: "var(--mantine-color-dark-8)",
        textAlign: "center",
        // Clear the status bar in standalone PWA mode (viewport-fit=cover).
        padding: "calc(6px + env(safe-area-inset-top)) 16px 6px",
      }}
    >
      <Text size="sm" fw={600} lh={1.3}>
        You&apos;re offline — pages won&apos;t load until the connection returns.
      </Text>
    </Box>
  );
}
