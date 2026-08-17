import { Paper, Skeleton, Stack } from "@mantine/core";

export default function GeneralLoading() {
  return (
    <Stack>
      <Paper withBorder p="sm">
        <Stack gap="sm">
          <Skeleton height={20} width="40%" />
          <Skeleton height={36} />
          <Skeleton height={36} width="25%" />
        </Stack>
      </Paper>
      <Paper withBorder p="sm">
        <Stack gap="sm">
          <Skeleton height={20} width="40%" />
          <Skeleton height={36} />
          <Skeleton height={24} />
          <Skeleton height={40} />
          <Skeleton height={36} width="25%" />
        </Stack>
      </Paper>
    </Stack>
  );
}