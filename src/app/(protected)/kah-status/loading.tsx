import { Group, Paper, Skeleton, Stack } from "@mantine/core";

import { SettingsTableSkeleton } from "../settings/SettingsTableSkeleton";

export default function KahStatusLoading() {
  return (
    <Stack gap="md" p="md">
      {/* Day navigation */}
      <Group align="center" gap="xs" wrap="nowrap">
        <Skeleton width={43} height={43} radius="md" />
        <Skeleton height={28} style={{ flex: 1 }} radius="sm" />
        <Skeleton width={43} height={43} radius="md" />
      </Group>

      {/* Mobile: card list */}
      <Stack gap="sm" hiddenFrom="lg">
        {Array.from({ length: 3 }).map((_, i) => (
          <Paper key={i} withBorder p="sm">
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap">
                <Skeleton height={20} width="40%" />
                <Skeleton height={22} width={64} radius="xl" />
              </Group>
              <Skeleton height={16} width="55%" />
              <Skeleton height={16} width="80%" />
            </Stack>
          </Paper>
        ))}
      </Stack>

      {/* Desktop: data table */}
      <SettingsTableSkeleton columns={[2, 2, 3, 4]} rows={4} visibleFrom="lg" />
    </Stack>
  );
}
