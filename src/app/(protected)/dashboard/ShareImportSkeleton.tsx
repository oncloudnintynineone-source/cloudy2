"use client";

import { Skeleton, Stack } from "@mantine/core";

import { LoadingStatus } from "@/components/LoadingStatus";

/** Loading placeholder for the shared-view preview (chunk + preview fetch). */
export function ShareImportSkeleton() {
  return (
    <Stack gap="sm" aria-busy>
      <LoadingStatus label="Loading shared view" />
      <Skeleton height={28} width="70%" />
      <Skeleton height={14} width="45%" />
      <Skeleton height={52} />
      <Skeleton height={52} />
      <Skeleton height={36} width="60%" ml="auto" />
    </Stack>
  );
}
