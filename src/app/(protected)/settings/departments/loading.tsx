import { Box, Group, Paper, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";
import { SettingsListChromeSkeleton } from "@/components/SettingsListChromeSkeleton";

export default function DepartmentsLoading() {
  return (
    <Stack gap="md" className="settings-pill-page-pad">
      <LoadingStatus label="Loading departments" />
      <SettingsListChromeSkeleton actionWidths={[150]} />

      <Box component="div" className="card-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <Paper key={i} withBorder p="sm">
            <Group justify="space-between" wrap="nowrap" align="center">
              <Group wrap="nowrap" align="center" gap={6}>
                <Skeleton height={12} width={12} circle />
                <Skeleton height={20} width="40%" />
              </Group>
              <Skeleton height={16} width={72} />
            </Group>
          </Paper>
        ))}
      </Box>
    </Stack>
  );
}
