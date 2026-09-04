import { Paper, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";

export default function SecurityLoading() {
  return (
    <Stack>
      <LoadingStatus label="Loading security settings" />
      <Paper withBorder p="sm">
        <Stack gap="sm">
          <Skeleton height={20} width="40%" />
          <Skeleton height={43} />
          <Skeleton height={43} width="25%" />
        </Stack>
      </Paper>
    </Stack>
  );
}
