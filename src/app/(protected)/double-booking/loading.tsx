import { Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";
import { PageContainer } from "@/components/PageContainer";

export default function DoubleBookingLoading() {
  return (
    <PageContainer>
      <Stack gap="md" p="md" pb="xl">
        <LoadingStatus label="Loading Double Booking" />
        <Stack gap={2}>
          <Skeleton h={24} w={160} />
          <Skeleton h={14} w={280} />
        </Stack>
        <Skeleton h={36} w={220} radius="md" />
        <Skeleton h={10} radius="sm" />
        <Skeleton h={10} radius="sm" width="80%" />
        <Skeleton h={10} radius="sm" width="60%" />
      </Stack>
    </PageContainer>
  );
}
