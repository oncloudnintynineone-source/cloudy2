import { Group, Paper, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";
import { PageContainer } from "@/components/PageContainer";

export default function KahStatusLoading() {
  return (
    <PageContainer>
      <Stack gap="md" pb="xl">
        <LoadingStatus label="Loading KAH status" />
        {/* Window header */}
        <Skeleton height={28} width="45%" radius="sm" />
        <Skeleton height={16} width="65%" radius="sm" />

        {/* Breach cards (members + event rows) */}
        <Stack gap="sm">
          {Array.from({ length: 3 }).map((_, i) => (
            <Paper key={i} withBorder p="sm">
              <Stack gap="xs">
                <Group gap="sm" align="flex-start" wrap="nowrap">
                  <Skeleton height={18} width={18} radius="sm" />
                  <Stack gap={6} style={{ flexGrow: 1, minWidth: 0 }}>
                    <Skeleton height={16} width="50%" />
                    <Skeleton height={12} width="35%" />
                  </Stack>
                </Group>
                <Group gap={4} wrap="wrap">
                  <Skeleton height={20} width={52} radius="xl" />
                  <Skeleton height={20} width={64} radius="xl" />
                  <Skeleton height={20} width={58} radius="xl" />
                  <Skeleton height={20} width={70} radius="xl" />
                </Group>
                <Skeleton height={12} width="80%" />
              </Stack>
            </Paper>
          ))}
        </Stack>
      </Stack>
    </PageContainer>
  );
}
