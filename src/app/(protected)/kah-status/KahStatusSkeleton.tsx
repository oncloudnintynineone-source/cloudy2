import { Box, Group, Paper, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";
import { WaitOverlay } from "@/components/WaitOverlay";
import { KAH_STATUS_WAIT_LINES, KAH_STATUS_WAIT_TIPS } from "@/lib/loading/waitCopy";

/**
 * The KAH page's loading block: the summary line + the group-card grid with a
 * roster, then a breach-period card — the same shapes as the content, so the
 * swap doesn't jump. Shared by the route loading screen and an in-view
 * look-ahead change. The block doubles as the wait overlay's positioning
 * context (a cold multi-group, multi-month scan can take seconds —
 * docs/loading-transitions.md §1.4.1).
 */
export function KahStatusSkeleton() {
  return (
    <Box pos="relative">
      <Stack gap="lg">
        <LoadingStatus label="Loading KAH status" />
        <Skeleton height={14} width="55%" radius="sm" />
        <Stack gap="sm">
          <Group justify="space-between" align="baseline">
            <Skeleton height={14} width={72} radius="sm" />
            <Skeleton height={12} width={128} radius="sm" />
          </Group>
          <Box className="c2-kah-groups">
            {Array.from({ length: 2 }).map((_, i) => (
              <Paper key={i} withBorder radius="md" p="md">
                <Stack gap="sm">
                  <Group gap="sm" align="flex-start" wrap="nowrap">
                    <Skeleton height={32} width={32} radius="xl" />
                    <Stack gap={6} style={{ flexGrow: 1, minWidth: 0 }}>
                      <Skeleton height={16} width="55%" />
                      <Skeleton height={12} width="70%" />
                    </Stack>
                  </Group>
                  <Skeleton height={14} width="45%" />
                  <Skeleton height={6} width="100%" radius="xl" />
                  <Stack gap={10}>
                    {Array.from({ length: 4 }).map((_, row) => (
                      <Group key={row} justify="space-between" wrap="nowrap">
                        <Stack gap={4} style={{ flexGrow: 1, minWidth: 0 }}>
                          <Skeleton height={13} width="40%" />
                          <Skeleton height={10} width="30%" />
                        </Stack>
                        <Skeleton height={20} width={72} radius="xl" />
                      </Group>
                    ))}
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Box>
        </Stack>
        <Stack gap="sm">
          <Skeleton height={14} width={104} radius="sm" />
          <Paper withBorder p="sm">
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
              </Group>
            </Stack>
          </Paper>
        </Stack>
      </Stack>
      <WaitOverlay lines={KAH_STATUS_WAIT_LINES} tips={KAH_STATUS_WAIT_TIPS} />
    </Box>
  );
}
