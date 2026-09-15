"use client";

import { Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "./LoadingStatus";

/**
 * Loading fallback for a lazy settings form opened inside a modal. Deliberately
 * generic: the form's real layout differs per entity, and the fallback only
 * covers the brief window before the chunk lands (usually never, since these
 * forms are opened by an explicit tap).
 */
export function FormModalSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Stack gap="sm" py="xs">
      <LoadingStatus label="Loading form" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} height={40} radius="sm" />
      ))}
      <Skeleton height={36} width={120} radius="sm" style={{ alignSelf: "flex-end" }} />
    </Stack>
  );
}
