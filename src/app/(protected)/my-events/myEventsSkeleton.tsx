import { Box, Group, Skeleton, Stack } from "@mantine/core";

import { WaitOverlay } from "@/components/WaitOverlay";
import { MY_EVENTS_WAIT_LINES, MY_EVENTS_WAIT_TIPS } from "@/lib/loading/waitCopy";

const LIST_BORDER = "1px solid var(--mantine-color-default-border)";

/**
 * The My Events result-list skeleton (a bordered, single-column row list).
 * Shared by the route fallback and the in-view crossfade so the two always
 * paint the same shape. The container is the positioning context for the
 * shared wait overlay (docs/loading-transitions.md §1.4.1), so both surfaces
 * dress the long always-fresh build identically.
 */
export function MyEventsListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Box
      style={{
        position: "relative",
        border: LIST_BORDER,
        borderRadius: "var(--mantine-radius-md)",
        overflow: "hidden",
      }}
    >
      <Stack gap={0}>
        {Array.from({ length: rows }, (_, index) => (
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
                <Skeleton height={12} radius={2} style={{ width: `${60 - (index % 3) * 12}%` }} />
                <Skeleton height={8} radius={2} w="40%" />
                <Group gap={6}>
                  <Skeleton circle height={18} style={{ flexShrink: 0 }} />
                  <Skeleton height={8} radius={2} w="30%" />
                </Group>
                <Group gap={6}>
                  <Skeleton circle height={18} style={{ flexShrink: 0 }} />
                  <Skeleton height={8} radius={2} w="24%" />
                </Group>
              </Stack>
            </Box>
          </Group>
        ))}
      </Stack>
      <WaitOverlay lines={MY_EVENTS_WAIT_LINES} tips={MY_EVENTS_WAIT_TIPS} />
    </Box>
  );
}
