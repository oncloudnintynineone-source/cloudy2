import { Group, Paper, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";

import { SettingsTableSkeleton } from "../SettingsTableSkeleton";

export default function QuickLinksLoading() {
  return (
    <Stack pb="xl" gap="sm">
      <LoadingStatus label="Loading quick links" />
      {/* Mobile: card list */}
      <Stack gap="sm" hiddenFrom="lg">
        {Array.from({ length: 3 }).map((_, i) => (
          <Paper key={i} withBorder p="sm">
            <Stack gap="xs">
              <Group justify="space-between">
                <Skeleton height={20} width="50%" />
                <Skeleton height={20} width={80} />
              </Group>
              <Skeleton height={16} width="70%" />
            </Stack>
          </Paper>
        ))}
      </Stack>

      {/* Desktop: toolbar row with the "Add quick link" button */}
      <Paper withBorder p="sm" visibleFrom="lg">
        <Group justify="flex-end" wrap="nowrap">
          <Skeleton width={160} height={43} />
        </Group>
      </Paper>

      {/* Desktop: data table (Label / URL / Status / Actions) */}
      <SettingsTableSkeleton columns={[2, 4, 1, 2]} rows={3} visibleFrom="lg" />
    </Stack>
  );
}
