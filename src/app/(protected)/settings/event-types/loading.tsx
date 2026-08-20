import { Group, Paper, Skeleton, Stack } from "@mantine/core";

export default function EventTypesLoading() {
  return (
    <Stack pb="xl" gap="sm">
      {Array.from({ length: 4 }).map((_, i) => (
        <Paper key={i} withBorder p="sm">
          <Stack gap="xs">
            <Skeleton height={20} width="40%" />
            <Group gap={6}>
              <Skeleton height={22} width={40} radius="xl" />
              <Skeleton height={22} width={64} radius="xl" />
              <Skeleton height={22} width={88} radius="xl" />
            </Group>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
