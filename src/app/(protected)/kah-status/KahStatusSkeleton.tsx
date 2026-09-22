import { Group, Paper, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";

/**
 * The KAH breach-card loading block: the shared results skeleton for the route
 * loading screen and for an in-view look-ahead change (the range dropdown's
 * server recompute). Skeleton-only, never a dimmed copy of the old cards.
 */
export function KahStatusSkeleton() {
  return (
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
  );
}
