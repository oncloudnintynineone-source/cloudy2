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
              live page's chrome block): the pill trigger is full column width
              on phones and 11rem from the desktop band on. */}
          <Box py="md" style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
            <Skeleton height={44} radius="md" w={{ base: "100%", lg: "11rem" }} />
          </Box>

          <MyEventsListSkeleton />
        </Stack>
      </PageContainer>
    </PageTransition>
  );
}
