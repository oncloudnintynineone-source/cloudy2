import { Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";

/**
 * Route-level loading fallback. Dashboard views are now on-demand tabs stored
 * server-side, so a generic skeleton can't be shaped to the arriving view the
 * way the old fixed five could — the whole content area loads as one plain box
 * (see docs/loading-transitions.md). The in-page skeletons (tab switches,
 * date navigation) inside DashboardView still shape themselves to the active
 * tab's renderer kind.
 */
export default function DashboardLoading() {
  return (
    <Stack pb="xl" gap="sm" style={{ marginTop: "calc(-1 * var(--app-shell-padding))" }}>
      <LoadingStatus label="Loading calendar" />
      <Skeleton radius="md" style={{ height: "min(70dvh, 640px)", width: "100%" }} />
    </Stack>
  );
}
