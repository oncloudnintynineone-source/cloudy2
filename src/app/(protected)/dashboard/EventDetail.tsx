"use client";

import { Badge, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import { deleteEvent } from "@/lib/events/actions";
import { subOneDay } from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";
import { eventRefFromCalendarEvent } from "@/lib/events/targets";
import { formatDateTime } from "./clientDateTime";

interface EventDetailProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDeleted: () => void;
  /** User id to display name (role-scoped roster). */
  peopleNames: Record<string, string>;
  /** Calendar (department) id to display name. */
  calendarNames: Record<string, string>;
}

export function EventDetail({
  event,
  onClose,
  onEdit,
  onDeleted,
  peopleNames,
  calendarNames,
}: EventDetailProps) {
  const [confirmOpen, { open, close }] = useDisclosure(false);

  if (!event) {
    return null;
  }

  const { allDay, eventType, calendarName, creatorId, inviteeUserIds, inviteeDepartmentIds } =
    event.payload;

  const peopleNamesResolved = [...new Set([...(creatorId ? [creatorId] : []), ...inviteeUserIds])]
    .map((id) => peopleNames[id])
    .filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index);
  // The event's own calendar is already badged below; don't show it twice.
  const departmentNamesResolved = [...new Set(inviteeDepartmentIds)]
    .filter((id) => id !== event.payload.calendarId)
    .map((id) => calendarNames[id])
    .filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index);
  const endDisplay = allDay
    ? formatDateTime(`${subOneDay(event.end.slice(0, 10))} 00:00:00`, true)
    : formatDateTime(event.end, false);

  async function handleDelete() {
    if (!event) {
      return;
    }
    const result = await deleteEvent(eventRefFromCalendarEvent(event));
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

          {peopleNamesResolved.length > 0 && (
            <Group gap={6} wrap="wrap" align="center">
              <Text size="xs" c="dimmed" fw={600}>
                People:
              </Text>
              {peopleNamesResolved.map((name) => (
                <Badge key={name} variant="light">
                  {name}
                </Badge>
              ))}
            </Group>
          )}

          {departmentNamesResolved.length > 0 && (
            <Group gap={6} wrap="wrap" align="center">
              <Text size="xs" c="dimmed" fw={600}>
                Departments:
              </Text>
              {departmentNamesResolved.map((name) => (
                <Badge key={name} variant="light" color="gray">
                  {name}
                </Badge>
              ))}
            </Group>
          )}

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
