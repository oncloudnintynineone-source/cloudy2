"use client";

import { Badge, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import { deleteEvent } from "@/lib/events/actions";
import { subOneDay } from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";
import { formatDateTime } from "./clientDateTime";

interface EventDetailProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDeleted: () => void;
}

export function EventDetail({ event, onClose, onEdit, onDeleted }: EventDetailProps) {
  const [confirmOpen, { open, close }] = useDisclosure(false);

  if (!event) {
    return null;
  }

  const { allDay, eventType, calendarName } = event.payload;
  const endDisplay = allDay
    ? formatDateTime(`${subOneDay(event.end.slice(0, 10))} 00:00:00`, true)
    : formatDateTime(event.end, false);

  async function handleDelete() {
    if (!event) {
      return;
    }
    const result = await deleteEvent({
      calendarId: event.payload.calendarId,
      googleEventId: event.payload.googleEventId,
    });
    if (result.ok) {
      notifications.show({ color: "green", message: "Event deleted" });
      close();
      onDeleted();
    } else {
      notifications.show({ color: "red", message: result.error });
    }
  }

  return (
    <>
      <Modal opened onClose={onClose} title="Event" centered size="sm">
        <Stack>
          <Text fw={600}>{event.title}</Text>

          {allDay ? (
            <Text size="sm" c="dimmed">
              {formatDateTime(event.start, true)}
              {endDisplay && endDisplay !== formatDateTime(event.start, true)
                ? ` – ${endDisplay}`
                : ""}
            </Text>
          ) : (
            <Text size="sm" c="dimmed">
              {formatDateTime(event.start, false)} – {endDisplay}
            </Text>
          )}

          <Group gap={6} wrap="wrap">
            {eventType && <Badge variant="light">{eventType}</Badge>}
            <Badge variant="outline" color="gray">
              {calendarName}
            </Badge>
          </Group>

          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={() => onEdit(event)}>
              Edit
            </Button>
            <Button variant="subtle" color="red" onClick={open}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={confirmOpen} onClose={close} title="Delete event" centered size="sm">
        <Text>Delete &quot;{event.title}&quot;?</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={close}>
            Cancel
          </Button>
          <Button color="red" onClick={handleDelete}>
            Delete
          </Button>
        </Group>
      </Modal>
    </>
  );
}
