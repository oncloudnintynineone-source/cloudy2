import { Box, Image, Skeleton, Stack, Text } from "@mantine/core";

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
 *
 * A decorative brand overlay (app icon breathing over "Waking from Deep
 * Sleep…") rides dead-centre on the pulsing box — mirrored byte-for-byte in
 * spirit by the PWA launch shell (`public/loading.html`) so every cold-start
 * phase reads as one continuous surface. Purely visual: it is `aria-hidden`
 * and pointer-transparent, and the sr-only `LoadingStatus` remains the only
 * announcement. Styling/animations live in the `c2-boot-*` rules in
 * globals.css (docs/loading-transitions.md).
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
      <Box className="c2-boot-shell" style={{ flex: 1, width: "100%" }}>
        <Skeleton radius="md" className="c2-boot-skeleton" />
        <div className="c2-boot-brand" aria-hidden="true">
          <Image src="/icon.svg" alt="" className="c2-boot-icon" draggable={false} />
          <Text className="c2-boot-text" size="sm" c="dimmed">
            Waking from Deep Sleep…
          </Text>
        </div>
      </Box>
    </Stack>
  );
}
