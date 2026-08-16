import { Paper, Skeleton, Stack } from "@mantine/core";

export default function GeneralLoading() {
  return (
    <Paper withBorder p="sm">
      <Stack gap="sm">
        <Skeleton height={20} width="40%" />
        <Skeleton height={36} />
        <Skeleton height={36} width="25%" />
      </Stack>
    </Paper>
  );
}
