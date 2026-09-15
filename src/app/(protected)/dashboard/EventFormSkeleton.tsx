"use client";

import { Box, Group, Skeleton, Stack, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

import { LoadingStatus } from "@/components/LoadingStatus";
import { WIZARD_BODY_HEIGHT_DESKTOP, WIZARD_BODY_HEIGHT_MOBILE } from "./eventFormLayout";

/**
 * Loading fallback for the lazy `EventForm` chunk. It mirrors the wizard's
 * fixed body height so the modal never resizes while the chunk downloads
 * (the chunk is preloaded at idle, so this normally never shows).
 */
export function EventFormSkeleton() {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const bodyHeight = isDesktop ? WIZARD_BODY_HEIGHT_DESKTOP : WIZARD_BODY_HEIGHT_MOBILE;
  return (
    <Box
      style={{
        height: bodyHeight,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <LoadingStatus label="Loading event form" />
      <Stack gap="md" style={{ flex: 1 }}>
        <Skeleton height={26} width="42%" radius="sm" />
        <Skeleton height={44} radius="sm" />
        <Skeleton height={44} radius="sm" />
        <Skeleton height={44} width="68%" radius="sm" />
      </Stack>
      <Group justify="space-between" mt="md">
        <Skeleton height={36} width={96} radius="sm" />
        <Skeleton height={36} width={112} radius="sm" />
      </Group>
    </Box>
  );
}
