import { Box, Group, Skeleton, Stack } from "@mantine/core";

import { MonthGridSkeleton, monthGridRows } from "./calendarSkeleton";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function DashboardLoading() {
  return (
    <Stack pb="xl" gap="sm">
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          paddingBottom: 10,
          borderBottom: "1px solid var(--mantine-color-default-border)",
        }}
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={i}
            height={28}
            radius={6}
            width={i === 1 ? "55%" : "40%"}
            style={{ margin: "0 auto" }}
          />
        ))}
      </Box>

      <Group align="center" gap="xs" wrap="nowrap">
        <Skeleton width={43} height={43} radius="50%" />
        <Skeleton height={24} style={{ flex: 1 }} />
        <Skeleton width={43} height={43} radius="50%" />
        <Skeleton width={43} height={43} radius="50%" />
      </Group>

      <MonthGridSkeleton rows={monthGridRows(currentMonth())} />
    </Stack>
  );
}
