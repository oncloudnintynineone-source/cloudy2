import { Paper, Skeleton, Stack } from "@mantine/core";

export default function AuditLogLoading() {
  return (
    <Stack>
      <Paper withBorder p="sm">
        <Stack gap="sm">
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={20} width="60%" />
        </Stack>
      </Paper>
      {Array.from({ length: 4 }, (_, index) => (
        <Paper key={index} withBorder p="sm">
          <Stack gap="sm">
            <GroupSkeleton />
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

function GroupSkeleton() {
  return (
    <Stack gap="xs">
      <Skeleton height={18} width="40%" />
      <Skeleton height={14} width="70%" />
      <Skeleton height={14} width="50%" />
    </Stack>
  );
}
