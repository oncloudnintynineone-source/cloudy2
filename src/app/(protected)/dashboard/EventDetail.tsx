"use client";

import { useState } from "react";
import { Badge, Button, Group, Modal, Stack, Text, useMantineTheme } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconCopy } from "@tabler/icons-react";

import { deleteEvent, type EventActionOk } from "@/lib/events/actions";
import { subOneDay } from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";
import { nextOptimisticOpId, optimisticRemove, type OptimisticRemoveOp } from "@/lib/events/optimistic";
import { eventRefFromCalendarEvent } from "@/lib/events/targets";
import {
  modalContentWidth,
  scaleFromRect,
  transformOriginFromRect,
  type Rect,
} from "@/lib/motion/origin";
import { MOTION } from "@/lib/motion/timing";
import { BUTTON_LOADER_PROPS, NARROW_MEDIA_QUERY } from "@/lib/theme";
import { formatDateTime } from "./clientDateTime";

interface EventDetailProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: (event: CalendarEvent, originRect: Rect | null) => void;
  onDuplicate: (event: CalendarEvent, originRect: Rect | null) => void;
  onDeleted: () => void;
  /** Optimistic deletion: the row disappears on confirm, before the action returns. */
  onOptimistic: (op: OptimisticRemoveOp) => void;
  onOptimisticSettled: (opId: string, result: EventActionOk) => void;
  onOptimisticRollback: (opId: string) => void;
  /** User id to display name (active roster). */
  peopleNames: Record<string, string>;
  /** Calendar (department) id to display name. */
  calendarNames: Record<string, string>;
  /** Bounding rect of the clicked event chip; the modal grows out of / shrinks back into it. */
  originRect: Rect | null;
  /** Id of the currently signed-in user; editing also opens to attendees/members. */
  currentUserId: string;
  /** Admins may edit/delete any event and always bypass the organizer lock. */
  isAdmin: boolean;
  /**
   * Department (calendar) ids the current user actively belongs to, for the
   * "members of a tagged department may edit" check (mirrors the server guard).
   */
  myActiveDepartmentIds: string[];
}

export function EventDetail({
  event,
  onClose,
  onEdit,
  onDuplicate,
  onDeleted,
  onOptimistic,
  onOptimisticSettled,
  onOptimisticRollback,
  peopleNames,
  calendarNames,
  originRect,
  currentUserId,
  isAdmin,
  myActiveDepartmentIds,
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

  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  // The modal is `centered` with a fixed size, so its content center is the
  // viewport center; the transform-origin can therefore be derived purely from
  // the clicked element's rect (see src/lib/motion/origin.ts). The modal
  // widens xs (320px) -> sm (380px) -> md (440px): xs on very small phones,
  // sm on regular mobile, md at lg, matching the shrink scale.
  const viewport = {
    w: typeof window === "undefined" ? 0 : window.innerWidth,
    h: typeof window === "undefined" ? 0 : window.innerHeight,
  };
  const contentWidth = modalContentWidth(viewport, isNarrow ? 320 : isDesktop ? 440 : 380);
  const transitionProps = {
    transition: {
      in: { opacity: 1, transform: "scale(1)" },
      out: { opacity: 0, transform: `scale(${scaleFromRect(originRect, contentWidth)})` },
      common: { transformOrigin: transformOriginFromRect(originRect, viewport, "center") },
      transitionProperty: "transform, opacity",
    },
    duration: MOTION.modalZoom,
    exitDuration: MOTION.modalZoomExit,
    timingFunction: "cubic-bezier(0.3, 1.2, 0.4, 1)",
  } as const;

  const showEvent = event ?? displayEvent;
  const payload = showEvent?.payload;

  const ownerName = payload && payload.creatorId ? (peopleNames[payload.creatorId] ?? null) : null;
  // Attendees are the full invitee list — an organizer who tagged themselves
  // appears here too (the organizer's own Owner row above is about who manages
  // the event, not attendance). Id-keyed (not name-keyed) so the signed-in
  // user's badge is detectable even when display names collide.
  const peopleResolved = payload
    ? [...new Set(payload.inviteeUserIds)].flatMap((id) => {
        const name = peopleNames[id];
        return name ? [{ id, name }] : [];
      })
    : [];
  const departmentNamesResolved = payload
    ? [...new Set(payload.inviteeDepartmentIds)]
        .map((id) => calendarNames[id])
        .filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index)
    : [];
  // Who may edit/delete/duplicate: admins always; otherwise the organizer, any
  // attendee, and active members of tagged departments — unless the organizer
  // locked the event to themselves (admins bypass the lock). Mirrors the
  // server-side modifyGuard.
  const isCreator = payload ? payload.creatorId === currentUserId : false;
  const isOnEvent = payload
    ? payload.inviteeUserIds.includes(currentUserId) ||
      payload.inviteeDepartmentIds.some((id) => myActiveDepartmentIds.includes(id))
    : false;
  const canModify =
    isAdmin ||
    (payload !== undefined && (payload.ownerOnlyEdits ? isCreator : true) && (isCreator || isOnEvent));
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
    const optimisticId = nextOptimisticOpId();
    const ref = eventRefFromCalendarEvent(showEvent);
    // Hide the row immediately; roll back only if the delete fails.
    onOptimistic(
      optimisticRemove(optimisticId, {
        calendarId: ref.calendarId,
        googleEventId: ref.googleEventId,
        eventId: ref.eventId,
      }),
    );
    try {
      const result = await deleteEvent(ref);
      if (result.ok) {
        notifications.show({ color: "green", message: "Event deleted" });
        onOptimisticSettled(optimisticId, result);
        close();
        onDeleted();
      } else {
        notifications.show({ color: "red", message: result.error });
        onOptimisticRollback(optimisticId);
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
        size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
        keepMounted
        transitionProps={transitionProps}
      >
        {showEvent && payload ? (
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

            <Text size="xs" c="dimmed" fw={600}>
              Location
            </Text>
            <Group gap={6} wrap="wrap" align="center">
              {payload.outOfCamp ? (
                <Badge variant="light" color="yellow">
                  Out of Camp
                </Badge>
              ) : (
                <Badge variant="light" color="green">
                  In Camp
                </Badge>
              )}
              {payload.overseas && (
                <Badge variant="light" color="blue">
                  Overseas
                </Badge>
              )}
              {payload.location && (
                <Text size="sm" c="dimmed">
                  {payload.location}
                </Text>
              )}
            </Group>

            <Text size="xs" c="dimmed" fw={600}>
              Event Type
            </Text>
            <Group gap={6} wrap="wrap">
              {payload.eventType && <Badge variant="light">{payload.eventType}</Badge>}
            </Group>

            {payload.external && (
              <Group gap={6} wrap="wrap">
                <Badge variant="light" color="gray">
                  External
                </Badge>
              </Group>
            )}

            {ownerName && (
              <>
                <Text size="xs" c="dimmed" fw={600}>
                  Owner
                </Text>
                <Group gap={6} wrap="wrap">
                  <Badge variant="light" color="brand">
                    {ownerName}
                  </Badge>
                  {payload.ownerOnlyEdits && (
                    <Badge variant="light" color="red">
                      Organizer-only editing
                    </Badge>
                  )}
                </Group>
              </>
            )}

            {peopleResolved.length > 0 && (
              <>
                <Text size="xs" c="dimmed" fw={600}>
                  Participants
                </Text>
                <Group gap={6} wrap="wrap">
                  {peopleResolved.map(({ id, name }) => (
                    <Badge
                      key={id}
                      variant="light"
                      className={id === currentUserId ? "c2-my-badge" : undefined}
                    >
                      {id === currentUserId ? `${name} (You)` : name}
                    </Badge>
                  ))}
                </Group>
              </>
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

            {canModify ? (
              <Group justify="flex-end" mt="md">
                <Button
                  variant="light"
                  leftSection={<IconCopy size={16} />}
                  onClick={(e) => onDuplicate(showEvent, e.currentTarget.getBoundingClientRect())}
                >
                  Duplicate
                </Button>
                <Button
                  variant="light"
                  onClick={(e) => onEdit(showEvent, e.currentTarget.getBoundingClientRect())}
                >
                  Edit
                </Button>
                <Button variant="light" color="red" onClick={open}>
                  Delete
                </Button>
              </Group>
            ) : null}
          </Stack>
        ) : null}
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
