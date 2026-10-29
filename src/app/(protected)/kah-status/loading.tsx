import { Skeleton, Stack } from "@mantine/core";

import { PageContainer } from "@/components/PageContainer";
import { PageHeaderSkeleton } from "@/components/PageHeader";

import { KahStatusSkeleton } from "./KahStatusSkeleton";

export default function KahStatusLoading() {
  return (
    <PageContainer>
      <Stack gap="md" pb="xl">
        <PageHeaderSkeleton titleWidth="32%" subtitleWidth="70%" />
        <Stack gap={4}>
          <Skeleton height={12} width={64} radius="sm" />
          <Skeleton height={36} width={150} radius="sm" />
        </Stack>
        <KahStatusSkeleton />
      </Stack>
    </PageContainer>
  );
}
