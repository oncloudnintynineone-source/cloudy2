import { Box, Skeleton, Stack } from "@mantine/core";

import { PageContainer } from "@/components/PageContainer";
import { PageHeaderSkeleton } from "@/components/PageHeader";

import { KahStatusSkeleton } from "./KahStatusSkeleton";

export default function KahStatusLoading() {
  return (
    <PageContainer>
      <Stack gap="md" pb="xl">
        {/* Mirrors the page's sticky header block (title + look-ahead pill in
            the shared report-head row), which carries the header inside the
            same vertical gutter. */}
        <Box py="md">
          <div className="c2-report-head">
            <div className="c2-report-title">
              <PageHeaderSkeleton titleWidth="24%" subtitleWidth="30%" />
            </div>
            <div className="c2-report-controls">
              <div className="c2-report-range">
                <Skeleton height={44} radius="sm" />
              </div>
            </div>
          </div>
        </Box>
        <KahStatusSkeleton />
      </Stack>
    </PageContainer>
  );
}
