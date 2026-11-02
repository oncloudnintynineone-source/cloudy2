"use client";

import { Box, Group, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";

const LIST_BORDER = "1px solid var(--mantine-color-default-border)";

/** Loading placeholder for the pinned-events list (chunk + first read). */
export function PinnedEventsSkeleton() {
  return (
    <Box
      style={{
        border: LIST_BORDER,
        borderRadius: "var(--mantine-radius-md)",
        overflow: "hidden",
      }}
    >
      <LoadingStatus label="Loading pinned events" />
      <Stack gap={0}>
        {Array.from({ length: 3 }).map((_, index) => (
          <Group
            key={index}
            gap="sm"
            wrap="nowrap"
            align="flex-start"
            style={{
              padding: "var(--mantine-spacing-sm)",
              borderTop: index === 0 ? undefined : LIST_BORDER,
            }}
          >
            <Skeleton width={4} height={28} radius={2} style={{ flexShrink: 0, marginTop: 1 }} />
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Stack gap={8}>
                <Skeleton
                  height={12}
                  radius={2}
                  style={{ width: `${60 - (index % 3) * 12}%` }}
                />
                <Skeleton height={8} radius={2} w="40%" />
              </Stack>
            </Box>
          </Group>
        ))}
      </Stack>
    </Box>
  );
}
