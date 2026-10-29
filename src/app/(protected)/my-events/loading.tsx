import { Box, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";
import { PageContainer } from "@/components/PageContainer";
import { PageHeaderSkeleton } from "@/components/PageHeader";
import { PageTransition } from "@/components/PageTransition";

import { MyEventsListSkeleton } from "./myEventsSkeleton";

export default function MyEventsLoading() {
  return (
    <PageTransition>
      <PageContainer>
        <Stack gap="md">
          <LoadingStatus label="Loading your events" />
          <PageHeaderSkeleton titleWidth="24%" subtitleWidth="75%" />

          {/* The sticky Range control mirror (same vertical gutter as the
              live page's chrome block). */}
          <Box py="md" style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
            <Stack gap={4}>
              <Skeleton height={12} width={48} radius="sm" />
              <Skeleton height={36} width={150} radius="sm" />
            </Stack>
          </Box>

          <MyEventsListSkeleton />
        </Stack>
      </PageContainer>
    </PageTransition>
  );
}
