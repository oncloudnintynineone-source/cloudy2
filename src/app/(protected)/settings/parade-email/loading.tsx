import { Paper, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";

export default function ParadeEmailLoading() {
  return (
    <Stack>
      <LoadingStatus label="Loading parade state email settings" />
      <Paper withBorder p="sm" maw={720}>
        <Stack gap="sm">
          <Skeleton height={22} width="55%" />
          <Skeleton height={20} width="30%" />
          <Skeleton height={34} width="45%" />
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={160} />
          <Skeleton height={120} />
          <Skeleton height={36} width="30%" />
        </Stack>
      </Paper>
    </Stack>
  );
}
