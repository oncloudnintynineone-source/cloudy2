import { Group, Paper, Skeleton, Stack } from "@mantine/core";

import { SettingsTableSkeleton } from "../SettingsTableSkeleton";

export default function UsersLoading() {
  return (
    <Stack pb="xl">
      <Paper withBorder p="sm">
        <Group justify="space-between" wrap="nowrap">
          <Skeleton height={36} style={{ flex: 1 }} />
          <Skeleton width={43} height={43} radius="50%" />
        </Group>
      </Paper>

      {/* Mobile: card list */}
      <Stack gap="sm" hiddenFrom="lg">
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
      </Stack>

      {/* Desktop: data table (Name / Phone / Role / Department / Status / Actions) */}
      <SettingsTableSkeleton columns={[3, 2, 1.5, 2, 1.5, 1.2]} visibleFrom="lg" />
    </Stack>
  );
}
