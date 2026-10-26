"use client";

import { useMemo } from "react";
import { Button, CopyButton, Stack, Text, TextInput } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";

import { MotionModal } from "@/components/MotionModal";
import { buildEventShareLink } from "@/lib/events/deepLink";
import type { CalendarEvent } from "@/lib/events/queries";

interface ShareEventDialogProps {
  /** The event to share; null keeps the dialog closed. */
  event: CalendarEvent | null;
  onClose: () => void;
}

/**
 * Sharer side of an event link: turns the open event into a self-contained
 * `/share/event` link (group id + calendar id + date). The link is derived
 * synchronously from the event — no server round trip, no share row to manage
 * afterwards. Looks borrowed from the shared-view dialog.
 */
export function ShareEventDialog({ event, onClose }: ShareEventDialogProps) {
  const link = useMemo(() => {
    if (!event?.payload.eventId) {
      return null;
    }
    return buildEventShareLink({
      origin: window.location.origin,
      eventId: event.payload.eventId,
      calendarId: event.payload.calendarId,
      start: event.start,
    });
  }, [event]);

  return (
    <MotionModal
      opened={event !== null && link !== null}
      onClose={onClose}
      title="Share event"
      centered
      size="sm"
      zIndex={300}
    >
      {event && link !== null && (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Anyone signed in who has this link can open{" "}
            <Text span fw={600} c="var(--mantine-color-text)">
              {event.title}
            </Text>
            .
          </Text>
          <TextInput
            label="Share link"
            value={link}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            rightSectionWidth={96}
            rightSection={
              <CopyButton value={link} timeout={2000}>
                {({ copied, copy }) => (
                  <Button
                    size="compact-sm"
                    variant={copied ? "light" : "default"}
                    color={copied ? "teal" : undefined}
                    leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    onClick={copy}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                )}
              </CopyButton>
            }
          />
          <Text size="xs" c="dimmed">
            The link carries the event reference only; opening it still requires signing in.
          </Text>
        </Stack>
      )}
    </MotionModal>
  );
}
