import { Skeleton, Stack } from "@mantine/core";

import { PageContainer } from "@/components/PageContainer";

import { KahStatusSkeleton } from "./KahStatusSkeleton";

export default function KahStatusLoading() {
  return (
    <PageContainer>
      <Stack gap="md" pb="xl">
        {/* Window header */}
        <Skeleton height={28} width="45%" radius="sm" />
        <Skeleton height={16} width="65%" radius="sm" />
        <KahStatusSkeleton />
      </Stack>
    </PageContainer>
  );
}
