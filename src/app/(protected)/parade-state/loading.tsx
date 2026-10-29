import { Group, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";
import { PageContainer } from "@/components/PageContainer";
import { PageHeaderSkeleton } from "@/components/PageHeader";

import { ParadeStateDepartmentSkeleton } from "./paradeStateSkeleton";

export default function ParadeStateLoading() {
  return (
    <PageContainer>
      <LoadingStatus label="Loading parade state" />
      <Stack gap="md" className="fab-page-pad">
        <PageHeaderSkeleton />

        {/* Desktop: the sticky day-nav row. Below lg the day controls live in
            the floating bottom pill, so nothing sits in flow there. */}
        <Group visibleFrom="lg" align="center" gap="xs" wrap="nowrap">
          <Skeleton h={24} style={{ flex: 1 }} />
          <Skeleton w={36} h={36} radius="md" />
          <Skeleton w={36} h={36} radius="md" />
          <Skeleton w={36} h={36} radius="md" />
          <Skeleton w={36} h={36} radius="md" />
        </Group>

        <ParadeStateDepartmentSkeleton users={2} />
        <ParadeStateDepartmentSkeleton users={3} />
        <ParadeStateDepartmentSkeleton users={2} />
      </Stack>
    </PageContainer>
  );
}
