import { Paper, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";

export default function FeatureFlagsLoading() {
  return (
    <Stack>
      <LoadingStatus label="Loading feature flags" />
      <Paper withBorder p="sm">
        <Stack gap="sm">
          <Skeleton height={20} width="30%" />
          <Skeleton height={14} width="55%" />
          <Skeleton height={32} />
          <Skeleton height={43} />
          <Skeleton height={36} width="25%" />
        </Stack>
      </Paper>
    </Stack>
  );
}