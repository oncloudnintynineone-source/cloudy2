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
        {/* Mirrors the page's sticky header block: title on the left, the
            scan-target control + look-ahead pill on the right (the same
            `.c2-report-chrome` box and report-head row), so a cold load paints
            the head at its loaded height and never reflows on hydration. */}
        <Box className="c2-report-chrome">
          <div className="c2-report-head">
            <div className="c2-report-title">
              <PageHeaderSkeleton titleWidth="24%" subtitleWidth="45%" />
            </div>
            <div className="c2-report-controls">
              {/* The picker skeleton rides the same band switch as the real
                  control: one 44px pill on phones, the label row + chip stack
                  from 40em on — so neither band reflows when the head lands. */}
              <div className="c2-report-picker">
                <div className="c2-report-picker-compact">
                  <Skeleton height={44} width={150} radius="sm" />
                </div>
                <div className="c2-report-picker-stack">
                  <Stack gap="xs">
                    <Skeleton height={30} width={190} radius="sm" />
                    <Skeleton height={36} width={150} radius="sm" />
                  </Stack>
                </div>
              </div>
              <div className="c2-report-range">
                <Skeleton height={44} width={140} radius="sm" />
              </div>
            </div>
          </div>
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
