import { Box, Group, Paper, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";
import { SettingsListChromeSkeleton } from "@/components/SettingsListChromeSkeleton";

export default function UsersLoading() {
  return (
    <Stack gap="md" className="settings-pill-page-pad">
      <LoadingStatus label="Loading users" />
      <SettingsListChromeSkeleton showFilter actionWidths={[104]} />

      <Box component="div" className="card-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <Paper key={i} withBorder p="sm">
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={6} style={{ flex: 1 }}>
                  <Skeleton height={20} width="60%" />
                  <Skeleton height={14} width="80%" />
                </Stack>
                <Skeleton height={22} width={56} radius="xl" />
              </Group>
              <Group gap={6}>
                <Skeleton height={14} width={70} />
                <Skeleton height={20} width={48} radius="xl" />
                <Skeleton height={20} width={80} radius="xl" />
              </Group>
            </Stack>
          </Paper>
        ))}
      </Box>
    </Stack>
  );
}
