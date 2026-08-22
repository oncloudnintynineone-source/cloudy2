import { Group, Skeleton, Stack } from "@mantine/core";

import { SettingsTableSkeleton } from "../SettingsTableSkeleton";
import { AuditLogRowSkeleton } from "./AuditLogRowSkeleton";

export default function AuditLogLoading() {
  return (
    <Stack>
      <Group align="center" gap="xs" wrap="nowrap">
        <Skeleton height={43} style={{ flex: 1 }} radius="sm" />
        <Skeleton width={43} height={43} radius="50%" />
      </Group>

      {/* Mobile: card list */}
      <Stack gap="md" hiddenFrom="lg">
        {Array.from({ length: 4 }, (_, index) => (
          <AuditLogRowSkeleton key={index} />
        ))}
      </Stack>

      {/* Desktop: data table (Time / Actor / Action / Entity / Route / Details) */}
      <SettingsTableSkeleton columns={[2, 1.5, 1.5, 2, 2, 1.5]} rows={4} visibleFrom="lg" />
    </Stack>
  );
}
