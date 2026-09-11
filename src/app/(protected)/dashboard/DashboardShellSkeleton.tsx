import { Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";

/**
 * The Calendar route's full-area placeholder, shared by the route-level
 * `loading.tsx` (the server shell stream) and the client `DashboardScreen`
 * (while the device-local snapshot is read / the first revalidation runs).
 *
 * The box spans AppShell.Main's whole content box with an even 16px gutter on
 * every side (the shell's own `md` padding supplies the top/bottom/sides),
 * instead of hugging the header — it reads as one neutral full-area
 * placeholder. Sized against the same CSS vars Mantine uses for Main's inner
 * box so the box never lingers short of the footer nor scrolls the document.
 */
export function DashboardShellSkeleton() {
  return (
    <Stack
      gap="sm"
      style={{
        height:
          "calc(var(--app-shell-vh, 100dvh) - var(--app-shell-header-offset, 0rem) - var(--app-shell-footer-offset, 0rem) - var(--app-shell-padding) - var(--app-shell-padding))",
      }}
    >
      <LoadingStatus label="Loading calendar" />
      <Skeleton radius="md" style={{ flex: 1, width: "100%" }} />
    </Stack>
  );
}
