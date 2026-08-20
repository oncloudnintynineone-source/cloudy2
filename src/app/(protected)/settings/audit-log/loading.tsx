import { Group, Paper, Skeleton, Stack } from "@mantine/core";

export default function AuditLogLoading() {
  return (
    <Stack>
      <Group align="center" gap="xs" wrap="nowrap">
        <Skeleton height={43} style={{ flex: 1 }} radius="sm" />
        <Skeleton width={43} height={43} radius="50%" />
      </Group>
      {Array.from({ length: 4 }, (_, index) => (
        <Paper key={index} withBorder p="sm">
          <Stack gap="xs">
            <Skeleton height={18} width="40%" />
            <Skeleton height={14} width="70%" />
            <Skeleton height={14} width="50%" />
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
