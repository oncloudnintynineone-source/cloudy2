import { Box, Skeleton, Stack } from "@mantine/core";

import { PageContainer } from "@/components/PageContainer";
import { PageHeaderSkeleton } from "@/components/PageHeader";

import { KahStatusSkeleton } from "./KahStatusSkeleton";

export default function KahStatusLoading() {
  return (
    <PageContainer>
      <Stack gap="md" pb="xl">
        {/* Mirrors the page's sticky header block (title + look-ahead pill in
            the shared report-head row) — same `.c2-report-chrome` box, so the
            skeleton's head is exactly the height the loaded head will be. */}
        <Box className="c2-report-chrome">
          <div className="c2-report-head">
            <div className="c2-report-title">
              <PageHeaderSkeleton titleWidth="24%" subtitleWidth="30%" />
            </div>
            <div className="c2-report-controls">
              <div className="c2-report-range">
                <Skeleton height={44} width={140} radius="sm" />
              </div>
            </div>
          </div>
        </Box>
        <KahStatusSkeleton />
      </Stack>
    </PageContainer>
  );
}
