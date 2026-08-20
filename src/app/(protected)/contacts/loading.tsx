import { Group, Paper, Skeleton, Stack } from "@mantine/core";

export default function ContactsLoading() {
  return (
    <Stack pb="xl">
      <Paper withBorder p="sm">
        <Skeleton height={36} />
      </Paper>

      <Stack gap="sm">
        {Array.from({ length: 6 }).map((_, i) => (
          <Paper key={i} withBorder p="sm">
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={6} style={{ flex: 1 }}>
                  <Skeleton height={20} width="60%" />
                  <Skeleton height={14} width="80%" />
                </Stack>
                <Group gap={6} wrap="nowrap">
                  <Skeleton width={40} height={40} radius={8} />
                  <Skeleton width={40} height={40} radius={8} />
                </Group>
              </Group>
              <Group gap={6}>
                <Skeleton height={14} width={70} />
                <Skeleton height={20} width={48} radius="xl" />
                <Skeleton height={20} width={80} radius="xl" />
              </Group>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
}
