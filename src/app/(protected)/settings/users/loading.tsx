import { Paper, Skeleton, Stack } from "@mantine/core";

export default function UsersLoading() {
  return (
    <Stack pb="xl">
      <Paper withBorder p="sm">
        <Skeleton height={36} />
      </Paper>

      <Stack gap="sm">
        {Array.from({ length: 6 }).map((_, i) => (
          <Paper key={i} withBorder p="sm">
            <Stack gap="xs">
              <Skeleton height={20} width="60%" />
              <Skeleton height={24} width="40%" />
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
}
