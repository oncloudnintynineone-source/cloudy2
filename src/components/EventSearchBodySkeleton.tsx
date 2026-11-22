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
    // Verbatim copy of the body's own cap (see `EventSearchBody`): the fallback
    // must not import from the lazy chunk, so the two heights are repeated and
    // must change together — a different value would resize the dialog on swap.
    <Stack gap="sm" style={{ maxHeight: "min(84dvh, 760px)" }}>
      <Group gap="xs" wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
        {/* Mirrors the real toolbar row exactly — the query field and the two
            square controls all render at `TOOLBAR_CONTROL_SIZE` (43px ≈ the
            theme's `--input-height-sm`) in `EventSearchBody`, so the chunk swap
            never shifts the row. The constant is deliberately repeated rather
            than imported: this fallback must stay dependency-free (importing
            from the lazy body would pull that chunk into the chrome bundle). */}
        <Skeleton height={43} style={{ flex: 1, minWidth: 0 }} />
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
