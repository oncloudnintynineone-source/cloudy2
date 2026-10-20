"use client";

import { Box, Group, Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "./LoadingStatus";

const LIST_BORDER = "1px solid var(--mantine-color-default-border)";

/**
 * `next/dynamic` loading fallback for the event-search body. It renders inside
 * the already-open Modal chrome while the body chunk downloads, so the dialog
 * zooms out of the trigger exactly once and the content swaps in place — no
 * placeholder modal and no second animation.
 */
export default function EventSearchBodySkeleton() {
  return (
    <Stack gap="sm" style={{ maxHeight: "min(72dvh, 680px)" }}>
      <Group gap="xs" wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
        <Skeleton height={34} style={{ flex: 1, minWidth: 0 }} />
        <Skeleton width={43} height={43} radius="md" style={{ flexShrink: 0 }} />
        <Skeleton width={43} height={43} radius="md" style={{ flexShrink: 0 }} />
      </Group>
      <Box
        style={{
          border: LIST_BORDER,
          borderRadius: "var(--mantine-radius-md)",
          overflow: "hidden",
        }}
      >
        <LoadingStatus label="Loading search" />
        <Stack gap={0}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Group
              key={i}
              gap="sm"
              wrap="nowrap"
              align="center"
              style={{
                padding: "var(--mantine-spacing-sm)",
                borderTop: i === 0 ? undefined : LIST_BORDER,
              }}
            >
              <Skeleton width={4} height={28} radius={2} style={{ flexShrink: 0 }} />
              <Box style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <Skeleton height={13} radius={2} style={{ width: `${60 - (i % 3) * 12}%` }} />
                <Skeleton height={10} radius={2} style={{ width: "32%" }} />
              </Box>
            </Group>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
