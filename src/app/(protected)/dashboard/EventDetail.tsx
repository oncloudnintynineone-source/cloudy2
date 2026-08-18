"use client";

import { useState } from "react";
import { Badge, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import { deleteEvent } from "@/lib/events/actions";
import { subOneDay } from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";
import { eventRefFromCalendarEvent } from "@/lib/events/targets";
import {
  scaleFromRect,
  smModalContentWidth,
  transformOriginFromRect,
  type Rect,
} from "@/lib/motion/origin";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { formatDateTime } from "./clientDateTime";

interface EventDetailProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: (event: CalendarEvent, originRect: Rect | null) => void;
  onDeleted: () => void;
  /** User id to display name (role-scoped roster). */
  peopleNames: Record<string, string>;
  /** Calendar (department) id to display name. */
  calendarNames: Record<string, string>;
  /** Bounding rect of the clicked event chip; the modal grows out of / shrinks back into it. */
  originRect: Rect | null;
}

export function EventDetail({
  event,
  onClose,
  onEdit,
  onDeleted,
  peopleNames,
  calendarNames,
  originRect,
}: EventDetailProps) {
  const [confirmOpen, { open, close }] = useDisclosure(false);
  const [deleting, setDeleting] = useState(false);
  // Keep the last non-null event so the closing (shrink) animation still has
  // content while `opened` is already false. The render-time adjustment below
  // only replaces it when a *new* event arrives — a close (event → null) keeps
  // the previous event for the exit frame.
  const [displayEvent, setDisplayEvent] = useState<CalendarEvent | null>(event);
  const [prevEvent, setPrevEvent] = useState<CalendarEvent | null>(event);
  if (event && event !== prevEvent) {
    setPrevEvent(event);
    setDisplayEvent(event);
  }

  // The modal is `centered` with a fixed size, so its content center is the
  // viewport center; the transform-origin can therefore be derived purely from
  // the clicked element's rect (see src/lib/motion/origin.ts).
  const viewport = {
    w: typeof window === "undefined" ? 0 : window.innerWidth,
    h: typeof window === "undefined" ? 0 : window.innerHeight,
  };
  const contentWidth = smModalContentWidth(viewport);
  const transitionProps = {
    transition: {
      in: { opacity: 1, transform: "scale(1)" },
      out: { opacity: 0, transform: `scale(${scaleFromRect(originRect, contentWidth)})` },
      common: { transformOrigin: transformOriginFromRect(originRect, viewport, "center") },
      transitionProperty: "transform, opacity",
    },
    duration: 240,
    exitDuration: 200,
    timingFunction: "cubic-bezier(0.3, 1.2, 0.4, 1)",
  } as const;

  const showEvent = event ?? displayEvent;
  const payload = showEvent?.payload;

  const peopleNamesResolved = payload
    ? [...new Set([...(payload.creatorId ? [payload.creatorId] : []), ...payload.inviteeUserIds])]
        .map((id) => peopleNames[id])
        .filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index)
    : [];
  // The event's own calendar is already badged below; don't show it twice.
  const departmentNamesResolved = payload
    ? [...new Set(payload.inviteeDepartmentIds)]
        .filter((id) => id !== payload.calendarId)
        .map((id) => calendarNames[id])
        .filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index)
    : [];
  const endDisplay =
    showEvent && payload
      ? payload.allDay
        ? formatDateTime(`${subOneDay(showEvent.end.slice(0, 10))} 00:00:00`, true)
        : formatDateTime(showEvent.end, false)
      : "";

  async function handleDelete() {
    if (!showEvent || deleting) {
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteEvent(eventRefFromCalendarEvent(showEvent));
      if (result.ok) {
        notifications.show({ color: "green", message: "Event deleted" });
        close();
        onDeleted();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Modal
        opened={event !== null}
        onClose={onClose}
        title="Event"
        centered
        size="sm"
        keepMounted
        transitionProps={transitionProps}
      >
        {showEvent && payload && (
          <Stack>
            <Text fw={600}>{showEvent.title}</Text>

            {payload.allDay ? (
              <Text size="sm" c="dimmed">
                {formatDateTime(showEvent.start, true)}
                {endDisplay && endDisplay !== formatDateTime(showEvent.start, true)
                  ? ` – ${endDisplay}`
                  : ""}
              </Text>
            ) : (
              <Text size="sm" c="dimmed">
                {formatDateTime(showEvent.start, false)} – {endDisplay}
              </Text>
            )}

            <Group gap={6} wrap="wrap">
              {payload.external && (
                <Badge variant="light" color="gray">
                  External
                </Badge>
              )}
              {payload.eventType && <Badge variant="light">{payload.eventType}</Badge>}
              <Badge variant="outline" color="accent">
                {payload.calendarName}
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
                  <Badge key={name} variant="light" color="accent">
                    {name}
                  </Badge>
                ))}
              </Group>
            )}

            <Group justify="flex-end" mt="md">
              <Button
                variant="light"
                onClick={(e) => onEdit(showEvent, e.currentTarget.getBoundingClientRect())}
              >
                Edit
              </Button>
              <Button variant="subtle" color="red" onClick={open}>
                Delete
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {showEvent && (
        <Modal opened={confirmOpen} onClose={close} title="Delete event" centered size="sm">
          <Text>Delete &quot;{showEvent.title}&quot;?</Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deleting}
              loaderProps={BUTTON_LOADER_PROPS}
              onClick={handleDelete}
            >
              Delete
            </Button>
          </Group>
        </Modal>
      )}
    </>
  );
}
