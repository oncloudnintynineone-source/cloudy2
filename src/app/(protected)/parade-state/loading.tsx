import { Group, Skeleton, Stack } from "@mantine/core";

import { ParadeStateDepartmentSkeleton } from "./paradeStateSkeleton";

export default function ParadeStateLoading() {
  return (
    <Stack gap="md" p="md" pb="xl">
      <Group align="center" gap="xs" wrap="nowrap">
        <Skeleton w={43} h={43} circle />
        <Skeleton h={24} style={{ flex: 1 }} />
        <Skeleton w={43} h={43} circle />
        <Skeleton w={43} h={43} circle />
      </Group>
      <ParadeStateDepartmentSkeleton users={2} />
      <ParadeStateDepartmentSkeleton users={3} />
      <ParadeStateDepartmentSkeleton users={2} />
    </Stack>
  );
}
