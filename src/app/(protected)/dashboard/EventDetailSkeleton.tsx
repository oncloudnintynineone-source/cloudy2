"use client";

import { Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";

/**
 * Skeleton shaped like the detail body, shown while the event is fetched (the
 * Double Booking page's lazy open) and while the body chunk downloads.
 * Skeletons are the only loading indicator — no spinner, no dim.
 */
export function EventDetailSkeleton() {
  return (
    <Stack gap="sm">
      <LoadingStatus label="Loading event" />
      <Skeleton height={20} width="65%" radius="sm" />
      <Skeleton height={14} width="80%" radius="sm" />
      <Skeleton height={14} width="35%" radius="sm" />
      <Skeleton height={14} width="55%" radius="sm" />
      <Skeleton height={14} width="45%" radius="sm" />
      <Skeleton height={30} width="100%" radius="sm" mt="md" />
    </Stack>
  );
}
