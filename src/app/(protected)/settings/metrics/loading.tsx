import { Group, Paper, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";

export default function MetricsLoading() {
  return (
    <Stack gap="md">
      <LoadingStatus label="Loading resource usage" />
      <Group justify="space-between" wrap="wrap">
        <Stack gap={6} w="min(100%, 420px)">
          <Skeleton height={24} width="45%" />
          <Skeleton height={14} width="90%" />
        </Stack>
        <Skeleton height={36} width={150} radius="sm" />
      </Group>
      {[0, 1, 2].map((index) => (
        <Paper key={index} withBorder p="sm" radius="sm">
          <Stack gap="sm">
            <Skeleton height={16} width="35%" />
            <Skeleton height={22} width="55%" />
            <Skeleton height={8} radius="sm" />
          </Stack>
        </Paper>
      ))}
      <Paper withBorder p="sm" radius="sm">
        <Stack gap="sm">
          <Skeleton height={16} width="25%" />
          <Skeleton height={200} radius="sm" />
        </Stack>
      </Paper>
    </Stack>
  );
}
