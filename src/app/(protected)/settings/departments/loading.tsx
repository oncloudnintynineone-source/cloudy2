import { Group, Paper, Skeleton, Stack } from "@mantine/core";

export default function DepartmentsLoading() {
  return (
    <Stack pb="xl" gap="sm">
      {Array.from({ length: 4 }).map((_, i) => (
        <Paper key={i} withBorder p="sm">
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap">
              <Skeleton height={20} width="40%" />
              <Skeleton height={28} width={64} radius={6} />
            </Group>
            <Skeleton height={16} width="80%" />
            <Group justify="flex-end" wrap="nowrap">
              <Skeleton height={28} width={72} radius={6} />
              <Skeleton height={28} width={64} radius={6} />
            </Group>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
