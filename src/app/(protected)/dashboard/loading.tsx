import { Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";

/**
 * Route-level loading fallback. Dashboard views are now on-demand tabs stored
 * server-side, so a generic skeleton can't be shaped to the arriving view the
 * way the old fixed five could — the whole content area loads as one plain box
 * (see docs/loading-transitions.md). The in-page skeletons (tab switches,
 * date navigation) inside DashboardView still shape themselves to the active
 * tab's renderer kind.
 *
 * The box spans AppShell.Main's whole content box with an even 16px gutter on
 * every side (the shell's own `md` padding supplies the top/bottom/sides),
 * instead of hugging the header — it reads as one neutral full-area placeholder.
 * Sized against the same CSS vars Mantine uses for Main's inner box so the box
 * never lingers short of the footer nor scrolls the document.
 */
export default function DashboardLoading() {
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
