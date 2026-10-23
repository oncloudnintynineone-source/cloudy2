import { Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";

/**
 * Shaped skeleton for the per-event history list (the shared history modal).
 * Server-safe (no hooks) so any surface can paint it while the audit rows load
 * (skeleton-only loading rule).
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
