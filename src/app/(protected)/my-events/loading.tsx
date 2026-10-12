import { Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";
import { PageContainer } from "@/components/PageContainer";
import { PageTransition } from "@/components/PageTransition";

export default function MyEventsLoading() {
  return (
    <PageTransition>
      <PageContainer>
        <Stack gap="md">
          <LoadingStatus label="Loading your events" />
          <Skeleton height={42} width="45%" radius="sm" />
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} height={72} radius="sm" />
          ))}
        </Stack>
      </PageContainer>
    </PageTransition>
  );
}
