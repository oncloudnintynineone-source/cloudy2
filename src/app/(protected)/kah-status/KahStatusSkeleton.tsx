import { Box, Group, Paper, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";
import { WaitOverlay } from "@/components/WaitOverlay";
import { KAH_STATUS_WAIT_LINES, KAH_STATUS_WAIT_TIPS } from "@/lib/loading/waitCopy";

/**
 * The KAH breach-card loading block: the shared results skeleton for the route
 * loading screen and for an in-view look-ahead change (the range dropdown's
 * server recompute). Skeleton-only, never a dimmed copy of the old cards. The
 * block doubles as the wait overlay's positioning context — a cold multi-group
 * scan can take seconds, more on a long look-ahead (docs/loading-transitions.md
 * §1.4.1).
 */
export function KahStatusSkeleton() {
  return (
    <Box pos="relative">
      <Stack gap="sm">
        <LoadingStatus label="Loading KAH breaches" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Paper key={i} withBorder p="sm">
            <Stack gap="xs">
              <Group gap="sm" align="flex-start" wrap="nowrap">
                <Skeleton height={18} width={18} radius="sm" />
                <Stack gap={6} style={{ flexGrow: 1, minWidth: 0 }}>
                  <Skeleton height={16} width="50%" />
                  <Skeleton height={12} width="35%" />
                </Stack>
              </Group>
              <Group gap={4} wrap="wrap">
                <Skeleton height={20} width={52} radius="xl" />
                <Skeleton height={20} width={64} radius="xl" />
                <Skeleton height={20} width={58} radius="xl" />
                <Skeleton height={20} width={70} radius="xl" />
              </Group>
              <Skeleton height={12} width="80%" />
            </Stack>
          </Paper>
        ))}
      </Stack>
      <WaitOverlay lines={KAH_STATUS_WAIT_LINES} tips={KAH_STATUS_WAIT_TIPS} />
    </Box>
  );
}
