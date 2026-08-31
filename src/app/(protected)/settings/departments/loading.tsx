import { Group, Paper, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";

import { SettingsTableSkeleton } from "../SettingsTableSkeleton";

export default function DepartmentsLoading() {
  return (
    <Stack pb="xl" gap="sm">
      <LoadingStatus label="Loading departments" />
      {/* Mobile: card list — dot + name on the left, color label on the right */}
      <Stack gap="sm" hiddenFrom="lg">
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
      </Stack>

      {/* Desktop: toolbar row with the "Add department" button */}
      <Paper withBorder p="sm" visibleFrom="lg">
        <Group justify="flex-end" wrap="nowrap">
          <Skeleton width={150} height={43} />
        </Group>
      </Paper>

      {/* Desktop: data table (Name / External color) */}
      <SettingsTableSkeleton columns={[3, 4]} rows={4} visibleFrom="lg" />
    </Stack>
  );
}
