import { Group, Paper, Skeleton, Stack } from "@mantine/core";

import { SettingsTableSkeleton } from "../SettingsTableSkeleton";

export default function DepartmentsLoading() {
  return (
    <Stack pb="xl" gap="sm">
      {/* Mobile: card list */}
      <Stack gap="sm" hiddenFrom="lg">
        {Array.from({ length: 4 }).map((_, i) => (
          <Paper key={i} withBorder p="sm">
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap">
                <Skeleton height={20} width="40%" />
                <Skeleton height={28} width={64} radius={6} />
              </Group>
              <Skeleton height={16} width="80%" />
              <Group justify="flex-end" wrap="nowrap">
                <Skeleton height={28} width={72} radius={6} />
                <Skeleton height={28} width={64} radius={6} />
              </Group>
            </Stack>
          </Paper>
        ))}
      </Stack>

      {/* Desktop: data table (Name / Calendar ID / Actions) */}
      <SettingsTableSkeleton columns={[3, 4, 1.5]} rows={4} visibleFrom="lg" />
    </Stack>
  );
}
