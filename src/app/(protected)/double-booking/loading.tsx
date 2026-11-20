import { Box, Paper, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";
import { PageContainer } from "@/components/PageContainer";
import { PageHeaderSkeleton } from "@/components/PageHeader";
import { WaitOverlay } from "@/components/WaitOverlay";
import {
  DOUBLE_BOOKING_WAIT_LINES,
  DOUBLE_BOOKING_WAIT_TIPS,
} from "@/lib/loading/waitCopy";

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
        {/* The scan card doubles as the wait overlay's positioning context —
            a cold clash scan can take seconds, more on a long look-ahead
            (docs/loading-transitions.md §1.4.1). */}
        <Paper withBorder p="sm" pos="relative">
          <Stack gap={6}>
            <Skeleton height={10} radius="sm" />
            <Skeleton height={10} radius="sm" width="85%" />
            <Skeleton height={10} radius="sm" width="65%" />
          </Stack>
          <WaitOverlay lines={DOUBLE_BOOKING_WAIT_LINES} tips={DOUBLE_BOOKING_WAIT_TIPS} />
        </Paper>
      </Stack>
    </PageContainer>
  );
}
