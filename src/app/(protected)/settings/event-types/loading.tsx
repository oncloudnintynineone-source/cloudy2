import { Box, Group, Paper, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";
import { SettingsListChromeSkeleton } from "@/components/SettingsListChromeSkeleton";

export default function EventTypesLoading() {
  return (
    <Stack gap="md" className="settings-pill-page-pad">
      <LoadingStatus label="Loading event types" />
      <SettingsListChromeSkeleton actionWidths={[130, 140]} />

      <Box component="div" className="card-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <Paper key={i} withBorder p="sm">
            <Stack gap="xs">
              <Skeleton height={20} width="40%" />
              <Group gap={6}>
                <Skeleton height={22} width={40} radius="xl" />
                <Skeleton height={22} width={64} radius="xl" />
                <Skeleton height={22} width={88} radius="xl" />
              </Group>
            </Stack>
          </Paper>
        ))}
      </Box>
    </Stack>
  );
}
