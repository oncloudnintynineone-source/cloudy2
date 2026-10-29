import { Box, Paper, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";
import { PageContainer } from "@/components/PageContainer";
import { PageHeaderSkeleton } from "@/components/PageHeader";

export default function DoubleBookingLoading() {
  return (
    <PageContainer>
      <Stack gap="md" pb="xl">
        <LoadingStatus label="Loading Double Booking" />
        {/* Mirrors the page's sticky header block, which carries the header
            inside the same vertical gutter. */}
        <Box py="md">
          <PageHeaderSkeleton titleWidth="24%" subtitleWidth="45%" />
        </Box>
        <Paper withBorder p="sm">
          <Stack gap={6}>
            <Skeleton height={10} radius="sm" />
            <Skeleton height={10} radius="sm" width="85%" />
            <Skeleton height={10} radius="sm" width="65%" />
          </Stack>
        </Paper>
      </Stack>
    </PageContainer>
  );
}
