import { Group, Paper, Skeleton, Stack } from "@mantine/core";

import { SettingsTableSkeleton } from "../settings/SettingsTableSkeleton";

export default function KahStatusLoading() {
  return (
    <Stack gap="md" p="md">
      {/* Window header */}
      <Skeleton height={28} width="45%" radius="sm" />
      <Skeleton height={16} width="65%" radius="sm" />

      {/* Mobile: episode cards */}
      <Stack gap="sm" hiddenFrom="lg">
        {Array.from({ length: 3 }).map((_, i) => (
          <Paper key={i} withBorder p="sm">
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap">
                <Skeleton height={20} width="40%" />
                <Skeleton height={22} width={64} radius="xl" />
              </Group>
              <Skeleton height={16} width="55%" />
              <Skeleton height={16} width="70%" />
              <Skeleton height={16} width="80%" />
            </Stack>
          </Paper>
        ))}
      </Stack>

      {/* Desktop: episode table */}
      <SettingsTableSkeleton columns={[3, 2, 3, 2, 4]} rows={4} visibleFrom="lg" />
    </Stack>
  );
}
