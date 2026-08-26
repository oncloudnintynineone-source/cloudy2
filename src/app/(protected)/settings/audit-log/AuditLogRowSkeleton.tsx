import { Paper, Skeleton, Stack } from "@mantine/core";

/** One card matching the audit log row shape (action + time, actor, entity). */
export function AuditLogRowSkeleton() {
  return (
    <Paper withBorder p="sm">
      <Stack gap="xs">
        <Skeleton height={18} width="40%" />
        <Skeleton height={14} width="70%" />
        <Skeleton height={14} width="50%" />
      </Stack>
    </Paper>
  );
}
