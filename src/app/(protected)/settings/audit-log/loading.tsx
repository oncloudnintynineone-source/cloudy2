import { Group, Skeleton, Stack } from "@mantine/core";

import { AuditLogRowSkeleton } from "./AuditLogRowSkeleton";

export default function AuditLogLoading() {
  return (
    <Stack>
      <Group align="center" gap="xs" wrap="nowrap">
        <Skeleton height={43} style={{ flex: 1 }} radius="sm" />
        <Skeleton width={43} height={43} radius="50%" />
      </Group>
      {Array.from({ length: 4 }, (_, index) => (
        <AuditLogRowSkeleton key={index} />
      ))}
    </Stack>
  );
}
