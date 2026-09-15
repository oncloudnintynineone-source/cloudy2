"use client";

import { Center, Loader, Modal, Stack } from "@mantine/core";

import { LoadingStatus } from "./LoadingStatus";

/**
 * `next/dynamic` loading fallback for the event-search modal. It is deliberately
 * dependency-free (no `@mantine/schedule` / `@mantine/dates`) so a click that
 * races the chunk download still paints an immediate, correctly-sized dialog
 * instead of a dead click. The real modal swaps in place once the chunk lands.
 */
export default function EventSearchModalSkeleton() {
  return (
    <Modal
      opened
      onClose={() => {}}
      title="Search events"
      centered
      size="md"
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
    >
      <Stack>
        <Center mih={160}>
          <Loader size="sm" color="gray" />
          <LoadingStatus label="Loading search" />
        </Center>
      </Stack>
    </Modal>
  );
}
