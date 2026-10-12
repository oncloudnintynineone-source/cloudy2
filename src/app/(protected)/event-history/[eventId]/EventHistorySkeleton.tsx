import { Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";

/**
 * Shaped skeleton for the per-event history list. Server-safe (no hooks) so
 * both the route's `loading.tsx` and the client view's always-fresh re-read use
 * the same markup (skeleton-only loading rule).
 */
export function EventHistorySkeleton() {
  return (
    <Stack gap="sm">
      <LoadingStatus label="Loading event history" />
      <Skeleton height={42} width="60%" radius="sm" />
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} height={84} radius="sm" />
      ))}
    </Stack>
  );
}
