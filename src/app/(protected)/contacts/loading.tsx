import { Box, Group, Paper, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";
import { PageContainer } from "@/components/PageContainer";
import { PageHeaderSkeleton } from "@/components/PageHeader";

export default function ContactsLoading() {
  return (
    <PageContainer>
      <LoadingStatus label="Loading contacts" />
      <Stack pb="xl">
        <PageHeaderSkeleton />

        {/* Desktop: the sticky search/filter/export bar. Below lg the search and
            filter move to the floating bottom pill, so the bar is desktop-only. */}
        <Box visibleFrom="lg" py="md">
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Skeleton height={43} style={{ flex: 1 }} />
            <Skeleton width={43} height={43} radius="sm" />
            <Skeleton width={128} height={43} radius="sm" />
          </Group>
        </Box>

        <Box component="div" className="card-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <Paper key={i} withBorder p="sm">
              <Stack gap={0}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={6} style={{ flex: 1 }}>
                    <Skeleton height={20} width="60%" />
                    <Skeleton height={14} width="80%" />
                  </Stack>
                  <Group gap={6} wrap="nowrap">
                    <Skeleton width={36} height={36} radius="xl" />
                    <Skeleton width={36} height={36} radius="xl" />
                  </Group>
                </Group>
                <Group gap={6} mt={4}>
                  <Skeleton height={14} width={70} />
                  <Skeleton height={20} width={48} radius="xl" />
                  <Skeleton height={20} width={80} radius="xl" />
                </Group>
              </Stack>
            </Paper>
          ))}
        </Box>
      </Stack>
    </PageContainer>
  );
}
