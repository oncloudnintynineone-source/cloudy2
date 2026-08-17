import { Paper, Skeleton, Stack } from "@mantine/core";

export default function DashboardLoading() {
  return (
    <Stack pb="xl" gap="sm">
      <Skeleton height={36} width="60%" />
      <Skeleton height={20} width="30%" style={{ alignSelf: "flex-end" }} />
      <Paper withBorder p="sm">
        <Skeleton height={320} />
      </Paper>
    </Stack>
  );
}
