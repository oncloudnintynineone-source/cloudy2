"use client";

import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Skeleton,
  Stack,
  Text,
  Tooltip,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useMediaQuery, useViewportSize } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconBrandGoogle,
  IconCalendarEvent,
  IconCalendarPlus,
  IconCopy,
  IconDownload,
  IconHistory,
  IconPencil,
  IconShare3,
  IconTrash,
  IconUserMinus,
  IconUserPlus,
} from "@tabler/icons-react";

import { EventHistoryModal } from "@/components/EventHistoryModal";
import { LoadingStatus } from "@/components/LoadingStatus";
import { deleteEvent, setEventRegistration, type EventActionOk } from "@/lib/events/actions";
import { buildEventIcs, buildGoogleCalendarUrl, icsFileName } from "@/lib/events/calendarExport";
import { subOneDay } from "@/lib/events/datetime";
import { prefetchEventHistory } from "@/lib/events/historyCache";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import type { CalendarEvent } from "@/lib/events/queries";
import {
  nextOptimisticOpId,
  optimisticRemove,
  type OptimisticRemoveOp,
} from "@/lib/events/optimistic";
import { eventRefFromCalendarEvent } from "@/lib/events/targets";
import { modalContentWidth, type Rect } from "@/lib/motion/origin";
import {
  fadeTransitionProps,
  modalZoomTransitionProps,
  popoverTransitionProps,
} from "@/lib/motion/transitions";
import { useMotion } from "@/components/MotionProvider";
import { BUTTON_LOADER_PROPS, NARROW_MEDIA_QUERY } from "@/lib/theme";
import { formatDateTime } from "./clientDateTime";
import { ShareEventDialog } from "./ShareEventDialog";

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
  /**
   * Read-only mode (the Double Booking page's in-place detail): hides the
   * edit/duplicate/delete actions and offers "Open in calendar" instead.
   */
  readOnly?: boolean;
  /** Invoked by the read-only "Open in calendar" action. */
  onOpenInCalendar?: (event: CalendarEvent) => void;
  /** Refresh the surrounding calendar after a successful register/deregister. */
  onRegistrationChanged?: () => void;
  /**
   * The event is still being fetched: opens the modal immediately and shows a
   * shaped skeleton instead of a spinner/dim (skeleton-only loading rule).
   */
  loading?: boolean;
  /**
   * Stacking override for callers nested inside another modal (the event
   * wizard's review-step advisory). Undefined keeps Mantine's default.
   */
  zIndex?: number;
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
  readOnly = false,
  onOpenInCalendar,
  onRegistrationChanged,
  loading = false,
  zIndex,
}: EventDetailProps) {
  const [confirmOpen, { open, close }] = useDisclosure(false);
  const [deleting, setDeleting] = useState(false);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [registrationPatch, setRegistrationPatch] = useState<{
    eventId: string;
    inviteeUserIds: string[];
  } | null>(null);
  // The shared history modal, opened by the History button (stacked above this
  // modal via zIndex, replacing the old navigation to the history page).
  const [historyEventId, setHistoryEventId] = useState<string | null>(null);
  const [historyOrigin, setHistoryOrigin] = useState<Rect | null>(null);
  // The share dialog (stacked at zIndex 300 like the history modal): holds the
  // event whose link is shown, null keeps it closed.
  const [shareEvent, setShareEvent] = useState<CalendarEvent | null>(null);
  // Keep the last non-null event so the closing (shrink) animation still has
  // content while `opened` is already false. The render-time adjustment below
  // only replaces it when a *new* event arrives — a close (event → null) keeps
  // the previous event for the exit frame.
  const [displayEvent, setDisplayEvent] = useState<CalendarEvent | null>(event);
  const [prevEvent, setPrevEvent] = useState<CalendarEvent | null>(event);
  if (event && event !== prevEvent) {
    setPrevEvent(event);
    setDisplayEvent(event);
    setRegistrationPatch(null);
    setShareEvent(null);
  }

  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`);
  const isNarrow = useMediaQuery(NARROW_MEDIA_QUERY);
  // The modal is `centered` with a fixed size, so its content center is the
  // viewport center; the transform-origin can therefore be derived purely from
  // the clicked element's rect (see src/lib/motion/origin.ts). The modal
  // widens xs (320px) -> sm (380px) -> md (440px): xs on very small phones,
  // sm on regular mobile, md at lg, matching the shrink scale.
  const motion = useMotion();
  const viewportSize = useViewportSize();
  const viewport = { w: viewportSize.width, h: viewportSize.height };
  const contentWidth = modalContentWidth(viewport, isNarrow ? 320 : isDesktop ? 440 : 380);
  const transitionProps = modalZoomTransitionProps(motion, originRect, viewport, contentWidth);

  const showEvent = event ?? displayEvent;
  const payload = showEvent?.payload;
  const registrationEnabled = payload?.registrationEnabled === true;
  const effectiveInviteeUserIds =
    payload && registrationPatch && payload.eventId === registrationPatch.eventId
      ? registrationPatch.inviteeUserIds
      : (payload?.inviteeUserIds ?? []);
  const isRegistered = effectiveInviteeUserIds.includes(currentUserId);
  const registeredCount = new Set(effectiveInviteeUserIds).size;

  const ownerName = payload && payload.creatorId ? (peopleNames[payload.creatorId] ?? null) : null;
  // Attendees are the full invitee list — an organizer who tagged themselves
  // appears here too (the organizer's own Owner row above is about who manages
  // the event, not attendance). Id-keyed (not name-keyed) so the signed-in
  // user's badge is detectable even when display names collide.
  const peopleResolved = payload
    ? [...new Set(effectiveInviteeUserIds)].flatMap((id) => {
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
  // locked the event to themselves (admins bypass the lock). Registration
  // events are organizer/admin-only; everyone else may only register.
  // Mirrors the server-side modifyGuard + registrationEditGuard.
  const isCreator = payload ? payload.creatorId === currentUserId : false;
  const isOnEvent = payload
    ? effectiveInviteeUserIds.includes(currentUserId) ||
      payload.inviteeDepartmentIds.some((id) => myActiveDepartmentIds.includes(id))
    : false;
  const canModify =
    isAdmin ||
    (payload !== undefined &&
      (registrationEnabled
        ? isCreator
        : (payload.ownerOnlyEdits ? isCreator : true) && (isCreator || isOnEvent)));
  // The self-service Register/Deregister toggle is available on every
  // registration event (except read-only surfaces) — including to the organizer
  // and admins, who get it above their edit actions instead of having to open
  // the wizard to add/remove themselves.
  const registrationAvailable = !readOnly && registrationEnabled && Boolean(payload?.eventId);
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

  async function handleRegistration() {
    if (!showEvent || !payload?.eventId || registrationBusy) {
      return;
    }
    const intent = isRegistered ? "deregister" : "register";
    setRegistrationBusy(true);
    try {
      const result = await setEventRegistration(eventRefFromCalendarEvent(showEvent), intent);
      if (result.ok) {
        const next =
          intent === "register"
            ? [...new Set([...effectiveInviteeUserIds, currentUserId])]
            : effectiveInviteeUserIds.filter((id) => id !== currentUserId);
        setRegistrationPatch({ eventId: payload.eventId, inviteeUserIds: next });
        notifications.show({
          color: "green",
          message: intent === "register" ? "Registered for event" : "Deregistered from event",
        });
        onRegistrationChanged?.();
      } else {
        notifications.show({ color: "red", message: result.error });
      }
    } catch {
      notifications.show({ color: "red", message: "Could not update registration" });
    } finally {
      setRegistrationBusy(false);
    }
  }

  return (
    <>
      <Modal
        opened={loading || event !== null}
        onClose={onClose}
        title="Event"
        centered
        size={isNarrow ? "xs" : isDesktop ? "md" : "sm"}
        keepMounted
        zIndex={zIndex}
        transitionProps={transitionProps}
      >
        {loading ? (
          <EventDetailSkeleton />
        ) : showEvent && payload ? (
          <Stack className={CONTENT_ENTER_CLASS}>
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
              {registrationEnabled && (
                <Badge variant="light" color="accent">
                  Registration event
                </Badge>
              )}
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
                  {payload.ownerOnlyEdits && !registrationEnabled && (
                    <Badge variant="light" color="red">
                      Organizer-only editing
                    </Badge>
                  )}
                </Group>
              </>
            )}

            {(registrationEnabled ? registeredCount > 0 : peopleResolved.length > 0) ? (
              <>
                <Text size="xs" c="dimmed" fw={600}>
                  {registrationEnabled ? `Registered (${registeredCount})` : "Participants"}
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
            ) : registrationEnabled ? (
              <>
                <Text size="xs" c="dimmed" fw={600}>
                  Registered (0)
                </Text>
                <Text size="sm" c="dimmed">
                  No one has registered yet.
                </Text>
              </>
            ) : null}

            {departmentNamesResolved.length > 0 && (
              <>
                <Text size="xs" c="dimmed" fw={600}>
                  Departments
                </Text>
                <Group gap={6} wrap="wrap">
                  {departmentNamesResolved.map((name) => (
                    <Badge key={name} variant="light" color="accent">
                      {name}
                    </Badge>
                  ))}
                </Group>
              </>
            )}

            {readOnly ? (
              <Group justify="flex-end" gap="xs" mt="md">
                <AddToCalendarMenu event={showEvent} />
                {onOpenInCalendar && (
                  <Button
                    variant="light"
                    size="md"
                    leftSection={<IconCalendarEvent size={18} />}
                    onClick={() => onOpenInCalendar(showEvent)}
                  >
                    Open in calendar
                  </Button>
                )}
              </Group>
            ) : canModify ? (
              <Stack gap="xs" mt="md">
                <Group justify="flex-end" gap="xs">
                  {payload.eventId && (
                    <ShareEventButton onClick={() => setShareEvent(showEvent)} />
                  )}
                  <EventActionsMenu event={showEvent} onDuplicate={onDuplicate} />
                  {payload.eventId && (
                    <Tooltip label="History" position="top">
                      <ActionIcon
                        variant="light"
                        color="gray"
                        size="xl"
                        aria-label="View event history"
                        onMouseEnter={() => {
                          if (payload.eventId) {
                            prefetchEventHistory(payload.eventId);
                          }
                        }}
                        onClick={(event) => {
                          setHistoryOrigin(event.currentTarget.getBoundingClientRect());
                          setHistoryEventId(payload.eventId);
                        }}
                      >
                        <IconHistory size={22} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <Tooltip label="Edit" position="top">
                    <ActionIcon
                      variant="light"
                      color="gray"
                      size="xl"
                      aria-label="Edit event"
                      onClick={(e) => onEdit(showEvent, e.currentTarget.getBoundingClientRect())}
                    >
                      <IconPencil size={22} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Delete" position="top">
                    <ActionIcon
                      variant="light"
                      color="red"
                      size="xl"
                      aria-label="Delete event"
                      onClick={open}
                    >
                      <IconTrash size={22} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
                {registrationAvailable && (
                  <Button
                    size="md"
                    color={isRegistered ? "gray" : "brand"}
                    variant={isRegistered ? "light" : "filled"}
                    loading={registrationBusy}
                    loaderProps={BUTTON_LOADER_PROPS}
                    leftSection={
                      isRegistered ? <IconUserMinus size={18} /> : <IconUserPlus size={18} />
                    }
                    onClick={handleRegistration}
                  >
                    {isRegistered ? "Deregister" : "Register"}
                  </Button>
                )}
              </Stack>
            ) : registrationAvailable ? (
              <Stack gap="xs" mt="md">
                <Text size="xs" c="dimmed">
                  This event is open for registration. Only the organizer and admins can edit it.
                </Text>
                <Group gap="xs">
                  <Button
                    flex="1"
                    size="md"
                    color={isRegistered ? "gray" : "brand"}
                    variant={isRegistered ? "light" : "filled"}
                    loading={registrationBusy}
                    loaderProps={BUTTON_LOADER_PROPS}
                    leftSection={
                      isRegistered ? <IconUserMinus size={18} /> : <IconUserPlus size={18} />
                    }
                    onClick={handleRegistration}
                  >
                    {isRegistered ? "Deregister" : "Register"}
                  </Button>
                  {payload.eventId && <ShareEventButton onClick={() => setShareEvent(showEvent)} />}
                  <AddToCalendarMenu event={showEvent} />
                </Group>
              </Stack>
            ) : (
              <>
                <Text size="xs" c="dimmed" mt="xs">
                  {registrationEnabled
                    ? "Only the organizer can edit this event."
                    : payload.ownerOnlyEdits && !isCreator
                      ? "Only the organizer can edit this event."
                      : "You can view this event but not edit it."}
                </Text>
                <Group justify="flex-end" gap="xs" mt="md">
                  {payload.eventId && <ShareEventButton onClick={() => setShareEvent(showEvent)} />}
                  <AddToCalendarMenu event={showEvent} />
                </Group>
              </>
            )}
          </Stack>
        ) : null}
      </Modal>

      {!readOnly && showEvent && (
        <Modal
          opened={confirmOpen}
          onClose={close}
          title="Delete event"
          centered
          size="sm"
          transitionProps={fadeTransitionProps(motion)}
        >
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

      <EventHistoryModal
        eventId={historyEventId}
        onClose={() => setHistoryEventId(null)}
        originRect={historyOrigin}
        title={showEvent?.title}
        zIndex={300}
      />

      <ShareEventDialog event={shareEvent} onClose={() => setShareEvent(null)} />
    </>
  );
}

/** Save the event as an `.ics` file the OS routes to the native calendar app. */
function downloadIcs(event: CalendarEvent) {
  const blob = new Blob([buildEventIcs(event)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = icsFileName(event);
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * The two "add to a personal calendar" menu items: a prefilled Google Calendar
 * link (opened in a new tab) and an `.ics` download. Shared by the read-only
 * add-to-calendar menu and the editable "More actions" menu.
 */
function CalendarExportMenuItems({ event }: { event: CalendarEvent }) {
  return (
    <>
      <Menu.Item
        component="a"
        href={buildGoogleCalendarUrl(event)}
        target="_blank"
        rel="noreferrer"
        leftSection={<IconBrandGoogle size={16} />}
      >
        Add to Google Calendar
      </Menu.Item>
      <Menu.Item onClick={() => downloadIcs(event)} leftSection={<IconDownload size={16} />}>
        Download .ics file
      </Menu.Item>
    </>
  );
}

/**
 * Standalone "Add to other Calendars" action: re-create this event in the user's
 * own calendar. Shown where there is no "More actions" menu to host it (the
 * read-only and view-only branches). Non-mutating — it never writes to the
 * department calendars or the audit log.
 */
function AddToCalendarMenu({ event }: { event: CalendarEvent }) {
  const motion = useMotion();
  return (
    <Menu position="bottom-end" zIndex={400} transitionProps={popoverTransitionProps(motion)}>
      <Menu.Target>
        <Tooltip label="Add to other Calendars" position="top">
          <ActionIcon variant="light" color="gray" size="xl" aria-label="Add to other Calendars">
            <IconCalendarPlus size={22} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <CalendarExportMenuItems event={event} />
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * The share action: opens the self-contained `/share/event` link dialog. Lives
 * left of the "More actions" menu (or of "Add to other Calendars" where there
 * is no menu) in every branch whose event has a group id.
 */
function ShareEventButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip label="Share" position="top">
      <ActionIcon
        variant="light"
        color="gray"
        size="xl"
        aria-label="Share event"
        onClick={onClick}
      >
        <IconShare3 size={22} />
      </ActionIcon>
    </Tooltip>
  );
}

/**
 * The editable modal's "More actions" menu: the Copy event action plus the two
 * personal-calendar exports, collapsed behind one icon so the action row stays
 * a single line. The duplicate origin rect comes from the clicked menu item, so
 * the wizard still grows out of where the tap landed.
 */
function EventActionsMenu({
  event,
  onDuplicate,
}: {
  event: CalendarEvent;
  onDuplicate: (event: CalendarEvent, originRect: Rect | null) => void;
}) {
  const motion = useMotion();
  return (
    <Menu position="bottom-end" zIndex={400} transitionProps={popoverTransitionProps(motion)}>
      <Menu.Target>
        <Tooltip label="More actions" position="top">
          <ActionIcon variant="light" color="gray" size="xl" aria-label="More actions">
            <IconCopy size={22} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconCopy size={16} />}
          onClick={(e) => onDuplicate(event, e.currentTarget.getBoundingClientRect())}
        >
          Copy event
        </Menu.Item>
        <CalendarExportMenuItems event={event} />
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * Skeleton shaped like the detail body, shown while the event is fetched (the
 * Double Booking page's lazy open). Skeletons are the only loading indicator —
 * no spinner, no dim.
 */
function EventDetailSkeleton() {
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
