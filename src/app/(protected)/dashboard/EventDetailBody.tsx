"use client";

import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Progress,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { usePathname } from "next/navigation";
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

import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { EventDetailSkeleton } from "./EventDetailSkeleton";
import { EventHistoryModal } from "@/components/EventHistoryModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { RadioCardGroup, type RadioCardOption } from "@/components/RadioCardGroup";
import { useActionPill } from "@/components/ActionPill";
import { PickerBadges, type PickerBadgeItem } from "@/components/PickerField";
import { RichRemarks } from "@/components/RichRemarks";
import {
  deleteEvent,
  setEventRegistration,
  type EventActionOk,
  type EventMutationScope,
} from "@/lib/events/actions";
import { withTimeout } from "@/lib/async";
import { buildEventIcs, buildGoogleCalendarUrl, icsFileName } from "@/lib/events/calendarExport";
import type { SeriesPrefillResult, SeriesPrefillScope } from "@/lib/events/seriesPrefill";
import { subOneDay } from "@/lib/events/datetime";
import { buildEventDeepLink } from "@/lib/events/deepLink";
import { prefetchEventHistory } from "@/lib/events/historyCache";
import { registrationPatchKey } from "@/lib/events/registration";
import type { CalendarEvent } from "@/lib/events/queries";
import {
  nextOptimisticOpId,
  optimisticRemove,
  type OptimisticRemoveOp,
} from "@/lib/events/optimistic";
import { eventRefFromCalendarEvent, type EventRef } from "@/lib/events/targets";
import type { Rect } from "@/lib/motion/origin";
import { popoverTransitionProps } from "@/lib/motion/transitions";
import { useMotion } from "@/components/MotionProvider";
import { capBadgeItems } from "@/lib/ui/badgeCap";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { useIsOffline } from "@/lib/ui/onlineStatus";
import { formatDateTime } from "./clientDateTime";
import { ShareEventDialog } from "./ShareEventDialog";

/** Chips shown before the "+N" expander in the detail modal's badge rows (C6). */
const DETAIL_BADGE_CAP = 5;

/**
 * The series scopes the detail modal's dialogs offer, each with the consequence
 * it has (docs/recurring-events.md §1.8/§1.9) — the one line that tells "this"
 * apart from "this and following" without opening the docs. Both dialogs filter
 * the list to the event's `editScopes`, so a registration series offers only
 * "All events" and an external/custom series only "This event".
 */
type ScopeOption = RadioCardOption & { value: EventMutationScope };

const EDIT_SCOPE_OPTIONS: readonly ScopeOption[] = [
  {
    value: "single",
    label: "This event",
    description: "Change only the occurrence you opened.",
  },
  {
    value: "following",
    label: "This and following events",
    description: "This occurrence and the later ones become a new series.",
  },
  {
    value: "series",
    label: "All events in the series",
    description: "Change every occurrence in the series.",
  },
];

const DELETE_SCOPE_OPTIONS: readonly ScopeOption[] = [
  {
    value: "single",
    label: "This event",
    description: "Remove only this occurrence; the rest of the series stays.",
  },
  {
    value: "following",
    label: "This and following events",
    description: "Remove this occurrence and every later one.",
  },
  {
    value: "series",
    label: "All events in the series",
    description: "Remove every occurrence in the series.",
  },
];

/**
 * Fetch the series prefill from the read-only route handler. A route (not a
 * server action) keeps the chooser off the serialized action queue and lets
 * closing the dialog abort the request.
 */
async function requestSeriesPrefill(
  ref: EventRef,
  scope: SeriesPrefillScope,
  signal: AbortSignal,
): Promise<SeriesPrefillResult> {
  try {
    const response = await fetch("/api/dashboard/series-prefill", {
      method: "POST",
      headers: { "content-type": "application/json", "x-cloudy2-api": "1" },
      credentials: "same-origin",
      body: JSON.stringify({ ref, scope }),
      signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 401
            ? "Your session expired — sign in again."
            : "Could not read the repeating series",
      };
    }
    return (await response.json()) as SeriesPrefillResult;
  } catch (error) {
    if (signal.aborted) {
      return { ok: false, error: "Request cancelled" };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not read the repeating series",
    };
  }
}

export interface EventDetailProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: (
    event: CalendarEvent,
    originRect: Rect | null,
    scope?: EventMutationScope | null,
  ) => void;
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
   * Offered the "History" action on the post-delete pill (docs/
   * ui-ux-improvements.md D6): the trail modal is hosted by the caller, since
   * this body unmounts with the details modal right after the delete. Callers
   * that don't host it get the old inert confirmation toast instead — never a
   * pill whose action would do nothing.
   */
  onViewDeletedHistory?: (target: { eventId: string; title: string }) => void;
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

export function EventDetailBody({
  event,
  onEdit,
  onDuplicate,
  onDeleted,
  onOptimistic,
  onOptimisticSettled,
  onOptimisticRollback,
  peopleNames,
  calendarNames,
  currentUserId,
  isAdmin,
  myActiveDepartmentIds,
  readOnly = false,
  onOpenInCalendar,
  onRegistrationChanged,
  onViewDeletedHistory,
  loading = false,
}: Omit<EventDetailProps, "originRect" | "zIndex" | "onClose">) {
  const pathname = usePathname();
  const { show: showActionPill } = useActionPill();
  // The calendar page itself: this body's details modal is already open there,
  // so the history modal's "Open in calendar" would navigate to what the user
  // is looking at — it is hidden on `/dashboard` and offered from the read-only
  // hosts (Double Booking / Parade State / KAH Status) instead.
  const onCalendarPage = pathname === "/dashboard";
  const [confirmOpen, { open, close }] = useDisclosure(false);
  const [deleting, setDeleting] = useState(false);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [registrationPatch, setRegistrationPatch] = useState<{
    /** Group id + occurrence slot this optimistic roster belongs to. */
    key: string;
    inviteeUserIds: string[];
  } | null>(null);
  const [editScopeOpen, setEditScopeOpen] = useState(false);
  const [editScope, setEditScope] = useState<EventMutationScope>("single");
  const [editScopeBusy, setEditScopeBusy] = useState(false);
  const [deleteScope, setDeleteScope] = useState<EventMutationScope>("single");
  // The scope prefill is a server action: guard it synchronously against
  // double-clicks and invalidate its result when the dialog/detail closes, so a
  // late response can never reopen the wizard over a discarded draft.
  const editScopeRequestRef = useRef(0);
  const editScopeBusyRef = useRef(false);
  const editScopeAbortRef = useRef<AbortController | null>(null);
  const offline = useIsOffline();
  // The shared history modal, opened by the History button (stacked above this
  // modal via zIndex, replacing the old navigation to the history page).
  const [historyEventId, setHistoryEventId] = useState<string | null>(null);
  const [historyOrigin, setHistoryOrigin] = useState<Rect | null>(null);
  // Participant chip cap (docs/ui-ux-improvements.md C6): a department-wide
  // event used to paint a wall of chips that pushed the action row off-screen.
  // People and departments share this one row (they are one attendee list, not
  // two sections), so one cap and one "+N" expand trigger cover both.
  const [participantsExpanded, setParticipantsExpanded] = useState(false);
  // The share dialog (stacked at zIndex 300 like the history modal): holds the
  // event whose link is shown, null keeps it closed.
  const [shareEvent, setShareEvent] = useState<CalendarEvent | null>(null);
  // Keep the last non-null event so the closing (shrink) animation still has
  // content while `opened` is already false. The render-time adjustment below
  // only replaces it when a *new* event arrives — a close (event → null) keeps
  // the previous event for the exit frame.
  const [displayEvent, setDisplayEvent] = useState<CalendarEvent | null>(event);
  const [prevEvent, setPrevEvent] = useState<CalendarEvent | null>(event);
  const eventKey = event ? `${event.id}:${event.payload.originalStartTime ?? ""}` : null;
  const [prevEventKey, setPrevEventKey] = useState<string | null>(eventKey);
  if (event && event !== prevEvent) {
    setPrevEvent(event);
    setDisplayEvent(event);
    setRegistrationPatch(null);
    setShareEvent(null);
    setParticipantsExpanded(false);
  }
  // Close the scope chooser only when the shown occurrence actually changes, not
  // when the same event object is refreshed with a new identity after a load.
  if (eventKey !== prevEventKey) {
    setPrevEventKey(eventKey);
    setEditScopeOpen(false);
    setEditScopeBusy(false);
    setDeleteScope("single");
    // A hidden detail body (keepMounted) must never keep a nested dialog open:
    // its portal would outlive the parent's hide and block whatever opens next
    // (docs/event-lifecycle.md §1.4.4).
    setHistoryEventId(null);
  }

  // Invalidate an in-flight scope prefill when the shown event changes/closes.
  // Refs are mutated in an effect (never during render); the modal's own state
  // is reset by the render-phase key adjustment above.
  useEffect(() => {
    editScopeRequestRef.current += 1;
    editScopeBusyRef.current = false;
    editScopeAbortRef.current?.abort();
    editScopeAbortRef.current = null;
  }, [eventKey]);

  const showEvent = event ?? displayEvent;
  const payload = showEvent?.payload;
  const registrationEnabled = payload?.registrationEnabled === true;
  const registrationKey = registrationPatchKey(
    payload?.eventId ?? null,
    payload?.originalStartTime ?? null,
  );
  const effectiveInviteeUserIds =
    payload && registrationPatch && registrationKey && registrationPatch.key === registrationKey
      ? registrationPatch.inviteeUserIds
      : (payload?.inviteeUserIds ?? []);
  const isRegistered = effectiveInviteeUserIds.includes(currentUserId);
  const registeredCount = new Set(effectiveInviteeUserIds).size;
  const registrationCap = registrationEnabled ? (payload?.registrationCap ?? null) : null;
  const registrationAtCapacity = registrationCap !== null && registeredCount >= registrationCap;
  // Only a not-yet-registered user is blocked; an existing registrant can
  // always deregister, and organizers/admins manage the roster via the wizard.
  const registrationFull = registrationAtCapacity && !isRegistered;

  // Repeating-series editing: an app-created series offers all three scopes; a
  // registration series is series-only; an external/custom series is
  // occurrence-only (its rule cannot be safely rewritten here).
  const isRecurring = Boolean(payload?.recurringEventId || payload?.recurrence);
  const isExternalSeries = Boolean(payload?.recurringEventId && !payload?.recurrence);
  const editScopes: EventMutationScope[] = !isRecurring
    ? []
    : registrationEnabled
      ? ["series"]
      : isExternalSeries
        ? ["single"]
        : ["single", "following", "series"];

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
  // One attendee row (C6, refined): people first, then departments, capped
  // **together** with the signed-in user's chip pinned first. They are one
  // attendee list, not two sections — the separate "Departments" heading made
  // people hunt for participants in two places. The amber tint stays the only
  // visual difference between the kinds (the same mapping the wizard's
  // Participants step teaches), and every department chip names its kind to
  // screen readers so the merged row never loses that information.
  const participantItems: PickerBadgeItem[] = [
    ...peopleResolved.map(({ id, name }) => ({
      key: `user:${id}`,
      label: name,
      self: id === currentUserId,
    })),
    ...departmentNamesResolved.map((name) => ({
      key: `dept:${name}`,
      label: name,
      color: "accent",
      srSuffix: "department",
    })),
  ];
  const participantsCap = capBadgeItems(
    participantItems,
    DETAIL_BADGE_CAP,
    (item) => item.self === true,
  );
  const participantBadges = participantsExpanded ? participantItems : participantsCap.visible;
  // The expand control's accessible name names the group it expands, so it
  // reads correctly for a registration roster and for a mixed attendee list.
  const participantGroup = registrationEnabled
    ? "registrants"
    : departmentNamesResolved.length > 0
      ? "participants and departments"
      : "participants";
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
    const ref = eventRefFromCalendarEvent(showEvent);
    const scope = isRecurring ? deleteScope : undefined;
    // A single-occurrence delete removes the shown copy; a series/following
    // delete can affect rows outside the current grid, so it waits for the
    // authoritative refresh instead of staging a partial overlay.
    const optimisticId = scope === undefined || scope === "single" ? nextOptimisticOpId() : null;
    if (optimisticId) {
      onOptimistic(
        optimisticRemove(optimisticId, {
          calendarId: ref.calendarId,
          googleEventId: ref.googleEventId,
          eventId: scope === "single" ? null : ref.eventId,
          ...(scope === "single"
            ? {
                recurringEventId: ref.recurringEventId ?? null,
                originalStartTime: ref.originalStartTime ?? null,
              }
            : {}),
        }),
      );
    }
    try {
      const result = await deleteEvent(ref, scope);
      if (result.ok) {
        if (optimisticId) {
          onOptimisticSettled(optimisticId, result);
        }
        close();
        onDeleted();
        // Actionable confirmation → action pill (docs/ui-ux-improvements.md
        // D6): the trail is the one follow-up worth offering after a delete.
        // External (payload-less) events have no history rows, and callers
        // without a hosted trail modal can't offer the action either — both
        // fall back to the inert green toast.
        if (ref.eventId && onViewDeletedHistory) {
          const eventId = ref.eventId;
          const title = showEvent.title;
          showActionPill({
            title:
              scope === "following"
                ? "Future events deleted"
                : scope === "series"
                  ? "Event series deleted"
                  : "Event deleted",
            label: "History",
            onAction: () => onViewDeletedHistory({ eventId, title }),
          });
        } else {
          notifications.show({
            color: "green",
            message:
              scope === "following"
                ? "Future events deleted"
                : scope === "series"
                  ? "Event series deleted"
                  : "Event deleted",
          });
        }
      } else {
        notifications.show({ color: "red", message: result.error });
        if (optimisticId) {
          onOptimisticRollback(optimisticId);
        }
      }
    } finally {
      setDeleting(false);
    }
  }

  function openEditScope() {
    editScopeAbortRef.current?.abort();
    editScopeAbortRef.current = null;
    editScopeRequestRef.current += 1;
    editScopeBusyRef.current = false;
    setEditScopeBusy(false);
    setEditScope(editScopes[0] ?? "single");
    setEditScopeOpen(true);
  }

  function closeEditScope() {
    editScopeAbortRef.current?.abort();
    editScopeAbortRef.current = null;
    editScopeRequestRef.current += 1;
    editScopeBusyRef.current = false;
    setEditScopeBusy(false);
    setEditScopeOpen(false);
  }

  async function chooseEditScope(scope: EventMutationScope) {
    if (!showEvent) {
      return;
    }
    if (!isRecurring || scope === "single") {
      closeEditScope();
      onEdit(showEvent, null, isRecurring ? "single" : null);
      return;
    }
    if (offline) {
      notifications.show({
        color: "orange",
        message: "You're offline — reconnect to edit the repeating series.",
      });
      return;
    }
    // Synchronous guard: a double-click can beat the React state update.
    if (editScopeBusyRef.current) {
      return;
    }
    editScopeBusyRef.current = true;
    setEditScopeBusy(true);
    const requestId = ++editScopeRequestRef.current;
    const controller = new AbortController();
    editScopeAbortRef.current?.abort();
    editScopeAbortRef.current = controller;
    try {
      const result = await withTimeout(
        requestSeriesPrefill(eventRefFromCalendarEvent(showEvent), scope, controller.signal),
        15_000,
      );
      if (requestId !== editScopeRequestRef.current) {
        return;
      }
      if (!result.ok) {
        notifications.show({ color: "red", message: result.error });
        return;
      }
      // Invalidate before handing off, so neither a duplicate result nor the
      // detail's close can race this open.
      editScopeRequestRef.current += 1;
      editScopeBusyRef.current = false;
      editScopeAbortRef.current = null;
      setEditScopeBusy(false);
      setEditScopeOpen(false);
      if (scope === "series") {
        if (!result.event) {
          notifications.show({ color: "red", message: "Could not read the repeating series" });
          return;
        }
        onEdit(result.event, null, "series");
      } else {
        onEdit(
          {
            ...showEvent,
            payload: {
              ...showEvent.payload,
              recurrence:
                result.recurrence && result.recurrence.count !== 1
                  ? result.recurrence
                  : result.recurrence?.count === 1
                    ? null
                    : (result.recurrence ?? null),
            },
          },
          null,
          "following",
        );
      }
    } catch (error) {
      if (requestId !== editScopeRequestRef.current) {
        return;
      }
      controller.abort();
      const timedOut = error instanceof Error && /timed out/i.test(error.message);
      notifications.show({
        color: "red",
        message: timedOut
          ? "The repeating series took too long to load — try again."
          : "Could not read the repeating series",
      });
    } finally {
      if (requestId === editScopeRequestRef.current) {
        editScopeBusyRef.current = false;
        editScopeAbortRef.current = null;
        setEditScopeBusy(false);
      }
    }
  }

  async function handleRegistration() {
    if (!showEvent || !payload?.eventId || registrationBusy) {
      return;
    }
    const intent = isRegistered ? "deregister" : "register";
    if (intent === "register" && registrationFull) {
      notifications.show({
        color: "red",
        message: `This event is full (${registeredCount} / ${registrationCap}).`,
      });
      return;
    }
    setRegistrationBusy(true);
    try {
      const result = await setEventRegistration(eventRefFromCalendarEvent(showEvent), intent);
      if (result.ok) {
        const next =
          intent === "register"
            ? [...new Set([...effectiveInviteeUserIds, currentUserId])]
            : effectiveInviteeUserIds.filter((id) => id !== currentUserId);
        const key = registrationPatchKey(payload.eventId, payload.originalStartTime ?? null);
        if (key) {
          setRegistrationPatch({ key, inviteeUserIds: next });
        }
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
      <CrossfadeSwap
        loading={loading}
        mode="overlay"
        animateHeight
        skeleton={<EventDetailSkeleton />}
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

            {(payload.recurrenceSummary || isRecurring) && (
              <Group gap={6} wrap="wrap">
                <Badge variant="light" color="brand">
                  {payload.recurrenceSummary ?? "Repeats (custom)"}
                </Badge>
                {payload.occurrenceOverride && (
                  <Badge variant="light" color="yellow">
                    Modified occurrence
                  </Badge>
                )}
              </Group>
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

            {(registrationEnabled ? registeredCount > 0 : participantItems.length > 0) ? (
              <>
                <Text size="xs" c="dimmed" fw={600}>
                  {registrationEnabled
                    ? registrationCap !== null
                      ? `Registered (${registeredCount} / ${registrationCap})`
                      : `Registered (${registeredCount})`
                    : "Participants"}
                </Text>
                <Stack gap={4}>
                  <PickerBadges items={participantBadges} size="compact" />
                  {participantItems.length > DETAIL_BADGE_CAP && (
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      w="fit-content"
                      aria-expanded={participantsExpanded}
                      aria-label={
                        participantsExpanded
                          ? `Show fewer ${participantGroup}`
                          : `Show all ${participantItems.length} ${participantGroup}`
                      }
                      onClick={() => setParticipantsExpanded((value) => !value)}
                    >
                      {participantsExpanded ? "Show less" : `+${participantsCap.overflow}`}
                    </Button>
                  )}
                </Stack>
              </>
            ) : registrationEnabled ? (
              <>
                <Text size="xs" c="dimmed" fw={600}>
                  {registrationCap !== null
                    ? `Registered (0 / ${registrationCap})`
                    : "Registered (0)"}
                </Text>
                <Text size="sm" c="dimmed">
                  No one has registered yet.
                </Text>
              </>
            ) : null}

            {registrationEnabled && registrationCap !== null && (
              <Stack gap={4}>
                <Progress
                  value={Math.min(100, (registeredCount / registrationCap) * 100)}
                  color={registrationAtCapacity ? "yellow" : "brand"}
                  size="sm"
                  aria-label={`${registeredCount} of ${registrationCap} registrations used`}
                />
                {registrationAtCapacity && (
                  <Text size="xs" c="yellow.8">
                    Registration is full ({registeredCount} / {registrationCap}).
                  </Text>
                )}
              </Stack>
            )}

            {payload.remarks?.trim() && (
              <>
                <Text size="xs" c="dimmed" fw={600}>
                  Remarks
                </Text>
                <RichRemarks text={payload.remarks} />
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
                  {payload.eventId && <ShareEventButton onClick={() => setShareEvent(showEvent)} />}
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
                      onClick={(e) => {
                        if (isRecurring) {
                          openEditScope();
                          return;
                        }
                        onEdit(showEvent, e.currentTarget.getBoundingClientRect());
                      }}
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
                      onClick={() => {
                        if (isRecurring) {
                          setDeleteScope((current) =>
                            editScopes.includes(current) ? current : (editScopes[0] ?? "single"),
                          );
                        }
                        open();
                      }}
                    >
                      <IconTrash size={22} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
                {registrationAvailable && (
                  <Stack gap={4}>
                    <Button
                      size="md"
                      color={isRegistered ? "gray" : "brand"}
                      variant={isRegistered ? "light" : "filled"}
                      loading={registrationBusy}
                      disabled={registrationFull}
                      loaderProps={BUTTON_LOADER_PROPS}
                      leftSection={
                        isRegistered ? <IconUserMinus size={18} /> : <IconUserPlus size={18} />
                      }
                      onClick={handleRegistration}
                    >
                      {isRegistered ? "Deregister" : "Register"}
                    </Button>
                    {isRecurring && (
                      <Text size="xs" c="dimmed">
                        Registration applies to this event only. Other events in the series are
                        unaffected.
                      </Text>
                    )}
                  </Stack>
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
                    disabled={registrationFull}
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
                {isRecurring && (
                  <Text size="xs" c="dimmed">
                    Registration applies to this event only. Other events in the series are
                    unaffected.
                  </Text>
                )}
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
      </CrossfadeSwap>

      {!readOnly && showEvent && (
        <ConfirmModal
          opened={confirmOpen}
          onClose={close}
          title={isRecurring ? "Delete repeating event" : "Delete event"}
          message={<>Delete &quot;{showEvent.title}&quot;?</>}
          loading={deleting}
          onConfirm={handleDelete}
          zIndex={300}
        >
          {isRecurring && (
            <RadioCardGroup
              label="Apply to"
              value={deleteScope}
              onChange={(value) => setDeleteScope(value as EventMutationScope)}
              options={DELETE_SCOPE_OPTIONS.filter((option) => editScopes.includes(option.value))}
            />
          )}
        </ConfirmModal>
      )}

      <ConfirmModal
        opened={editScopeOpen}
        onClose={closeEditScope}
        title="Edit repeating event"
        confirmLabel="Continue"
        confirmColor="brand"
        loading={editScopeBusy}
        onConfirm={() => void chooseEditScope(editScope)}
        zIndex={300}
      >
        <RadioCardGroup
          label="Apply to"
          value={editScope}
          onChange={(value) => setEditScope(value as EventMutationScope)}
          options={EDIT_SCOPE_OPTIONS.filter((option) => editScopes.includes(option.value))}
          description={
            isExternalSeries
              ? "This series was created outside the app. Only this occurrence can be edited here."
              : registrationEnabled
                ? "Registration events are edited as a whole series."
                : "This event is part of a repeating series."
          }
        />
      </ConfirmModal>

      <EventHistoryModal
        eventId={historyEventId}
        onClose={() => setHistoryEventId(null)}
        originRect={historyOrigin}
        title={showEvent?.title}
        detailLink={
          !onCalendarPage && showEvent?.payload.eventId
            ? buildEventDeepLink({
                view: null,
                start: showEvent.start,
                eventId: showEvent.payload.eventId,
                calendarId: showEvent.payload.calendarId,
              })
            : null
        }
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
        Copy to Other Google Calendar
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
      <ActionIcon variant="light" color="gray" size="xl" aria-label="Share event" onClick={onClick}>
        <IconShare3 size={22} />
      </ActionIcon>
    </Tooltip>
  );
}

/**
 * The editable modal's "More actions" menu: the **Duplicate Event** action plus
 * the two personal-calendar exports, collapsed behind one icon so the action row
 * stays a single line. The duplicate origin rect comes from the clicked menu
 * item, so the wizard still grows out of where the tap landed.
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
          Duplicate Event
        </Menu.Item>
        <CalendarExportMenuItems event={event} />
      </Menu.Dropdown>
    </Menu>
  );
}
