import { Group, Paper, Skeleton, Stack } from "@mantine/core";

import { SettingsTableSkeleton } from "../SettingsTableSkeleton";

export default function WebhooksLoading() {
  return (
    <Stack pb="xl" gap="sm">
      {/* Mobile: card list */}
      <Stack gap="sm" hiddenFrom="lg">
        {Array.from({ length: 3 }).map((_, i) => (
          <Paper key={i} withBorder p="sm">
            <Stack gap="xs">
              <Skeleton height={20} width="40%" />
              <Group gap={6}>
                <Skeleton height={22} width={64} radius="xl" />
                <Skeleton height={22} width={120} radius="xl" />
              </Group>
            </Stack>
          </Paper>
        ))}
      </Stack>

      {/* Desktop: toolbar row with the "Add webhook" button */}
      <Paper withBorder p="sm" visibleFrom="lg">
        <Group justify="flex-end" wrap="nowrap">
          <Skeleton width={140} height={43} />
        </Group>
      </Paper>

      {/* Desktop: data table (Name / URL / Status) */}
      <SettingsTableSkeleton columns={[2, 4, 1]} rows={3} visibleFrom="lg" />
    </Stack>
  );
}
