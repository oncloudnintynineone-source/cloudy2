import { Paper, Skeleton, Stack } from "@mantine/core";

export default function BannerLoading() {
  return (
    <Stack>
      <Paper withBorder p="sm">
        <Stack gap="sm">
          <Skeleton height={20} width="30%" />
          <Skeleton height={22} width="60%" />
          <Skeleton height={43} />
          <Skeleton height={20} width="35%" />
          <Skeleton height={34} />
          <Skeleton height={36} />
          <Skeleton height={36} width="25%" />
        </Stack>
      </Paper>
    </Stack>
  );
}
