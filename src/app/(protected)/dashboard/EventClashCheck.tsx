"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Button, Group, Modal, Paper, Skeleton, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCircleCheck, IconRefresh } from "@tabler/icons-react";

import { LoadingStatus } from "@/components/LoadingStatus";
import { ClashAffectedChips } from "@/components/clashUi";
import { ClashCard, ClashEventRow } from "@/components/clashCards";
import { ClashTimeline, type ClashTimelineEntry } from "@/components/clashTimeline";
import { EventDetail } from "./EventDetail";
import {
  checkEventClashes,
  getWizardClashEventDetail,
  type EventClashCheckRequest,
  type EventClashCheckResult,
  type EventClashEntry,
} from "@/lib/events/clashActions";
import { clashCoveredDayKeys, clashDayLabel, clashTypeLabel } from "@/lib/events/clashDisplay";
import { formatInstantToNaive } from "@/lib/events/datetime";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import type { Rect } from "@/lib/motion/origin";
import type { CalendarEvent } from "@/lib/events/queries";

type ClashCheckOk = Extract<EventClashCheckResult, { ok: true }>;

/** The panel's current view, derived from `request` + the latest outcome. */
type View = { kind: "checking" } | { kind: "error" } | { kind: "done"; result: ClashCheckOk };

/**
 * Pre-submit clash advisory for the event wizard's review step. Runs the
 * server check whenever `request` changes (a new stable request object is
 * produced by the parent each time the candidate time/people actually change)
 * and on an explicit Retry. Purely advisory — it never blocks the save.
 *
 * Tapping a conflicting event (timeline bar or row) opens an in-place
 * read-only `EventDetail` without leaving the draft, at parity with the Double
 * Booking page. The candidate's own "This event" bar stays inert. "Open in
 * calendar" is the one navigation: it asks for confirmation first, because it
 * discards the in-progress draft (see docs/event-clashes.md §1.6).
 */
export function EventClashCheck({
  request,
  isAdmin,
  onOpenInCalendar,
}: {
  request: EventClashCheckRequest | null;
  /** Admins may edit any event; passed through to the read-only detail modal. */
  isAdmin: boolean;
  /** Leave the wizard and open the tapped event on the calendar (after confirm). */
  onOpenInCalendar?: (event: CalendarEvent) => void;
}) {
  // `attempt` lets Retry re-run the same request without touching request's
  // identity. State is only ever set from the async action callbacks — the
  // "checking" view is derived from the request/outcome pair, never set
  // synchronously in the effect.
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<{
    request: EventClashCheckRequest;
    attempt: number;
    ok: boolean;
    result: ClashCheckOk | null;
  } | null>(null);

  // In-place detail modal: opens immediately (shaped skeleton) and lazily
  // fetches the full payload, so inspecting a conflict never navigates away
  // from the draft. A request token supersedes an in-flight fetch on close or
  // another tap.
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOrigin, setDetailOrigin] = useState<Rect | null>(null);
  const detailRequestRef = useRef(0);
  const [detail, setDetail] = useState<{
    event: CalendarEvent;
    peopleNames: Record<string, string>;
    calendarNames: Record<string, string>;
    myActiveDepartmentIds: string[];
  } | null>(null);
  const heldDetailLoading = useMinSkeletonHold(detailOpen && detailLoading);
  // "Open in calendar" leaves the wizard, so it is confirmed first (the draft
  // is discarded on the way out).
  const [leaveEvent, setLeaveEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    if (!request) {
      return;
    }
    // Server actions are not cancellable; ignore the result of a superseded
    // request (unmount or a newer request/attempt) via the cleanup flag.
    let cancelled = false;
    checkEventClashes(request)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setOutcome(
          result.ok
            ? { request, attempt, ok: true, result }
            : { request, attempt, ok: false, result: null },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setOutcome({ request, attempt, ok: false, result: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [request, attempt]);

  if (!request) {
    return null;
  }

  // Open the modal immediately (skeleton) and fetch the tapped event's full
  // payload in the background.
  async function openDetail(entry: EventClashEntry, rect: Rect) {
    if (!request) {
      return;
    }
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setDetailOrigin(rect);
    setDetail(null);
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const result = await getWizardClashEventDetail({
        request,
        calendarId: entry.calendarId,
        eventId: entry.eventId,
        googleEventId: entry.googleEventId,
        startNaive: entry.effectiveStartNaive,
        endNaive: entry.effectiveEndNaive,
      });
      if (requestId !== detailRequestRef.current) {
        return;
      }
      if (!result.ok) {
        setDetailOpen(false);
        setDetailLoading(false);
        notifications.show({ color: "red", message: result.error });
        return;
      }
      setDetail({
        event: { ...result.event, title: entry.title || result.event.title },
        peopleNames: result.peopleNames,
        calendarNames: result.calendarNames,
        myActiveDepartmentIds: result.myActiveDepartmentIds,
      });
      setDetailLoading(false);
    } catch {
      if (requestId !== detailRequestRef.current) {
        return;
      }
      setDetailOpen(false);
      setDetailLoading(false);
      notifications.show({ color: "red", message: "Could not load the event" });
    }
  }

  function closeDetail() {
    // Supersede any in-flight fetch so a late result can't reopen the modal.
    detailRequestRef.current += 1;
    setDetailOpen(false);
    setDetailLoading(false);
  }

  let view: View;
  if (outcome && outcome.request === request && outcome.attempt === attempt) {
    view =
      outcome.ok && outcome.result ? { kind: "done", result: outcome.result } : { kind: "error" };
  } else {
    view = { kind: "checking" };
  }

  if (view.kind === "checking") {
    return (
      <Paper withBorder p="sm">
        <LoadingStatus label="Checking for clashes" />
        <Stack gap={6}>
          <Skeleton height={10} radius="sm" />
          <Skeleton height={10} radius="sm" width="80%" />
        </Stack>
      </Paper>
    );
  }

  if (view.kind === "error") {
    return (
      <Paper withBorder p="sm">
        <Group justify="space-between" align="center" gap="xs" wrap="wrap">
          <Text size="xs" c="dimmed">
            Could not check for clashes.
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            leftSection={<IconRefresh size={12} />}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </Button>
        </Group>
      </Paper>
    );
  }

  const { result } = view;
  if (result.clashes.length > 0) {
    const affectedCount = new Set(
      result.clashes.flatMap((clash) => clash.affected.map((person) => person.userId)),
    ).size;

    // One timeline per covered day: the candidate ("This event", inert) plus
    // each conflicting event, which opens its in-place details on tap. Labels
    // come from the title-template engine.
    const entries: ClashTimelineEntry[] = [
      ...(result.candidate
        ? [
            {
              startNaive: result.candidate.effectiveStartNaive,
              endNaive: result.candidate.effectiveEndNaive,
              occupiesFullDay: result.candidate.occupiesFullDay,
              label: "This event",
              title: "This event",
              color: "brand",
            },
          ]
        : []),
      ...result.clashes.map((entry) => ({
        startNaive: entry.effectiveStartNaive,
        endNaive: entry.effectiveEndNaive,
        occupiesFullDay: entry.occupiesFullDay,
        label: entry.displayLabel ?? clashTypeLabel(entry),
        title: entry.title,
        color: entry.color,
        onSelect: (rect: Rect) => void openDetail(entry, rect),
      })),
    ];
    const coversDay = (entry: ClashTimelineEntry, dayKey: string) =>
      clashCoveredDayKeys({
        effectiveStartNaive: entry.startNaive,
        effectiveEndNaive: entry.endNaive,
        occupiesFullDay: entry.occupiesFullDay,
      }).includes(dayKey);
    const todayKey = formatInstantToNaive(new Date()).slice(0, 10);
    const dayKeys = [
      ...new Set(
        entries.flatMap((entry) =>
          clashCoveredDayKeys({
            effectiveStartNaive: entry.startNaive,
            effectiveEndNaive: entry.endNaive,
            occupiesFullDay: entry.occupiesFullDay,
          }),
        ),
      ),
    ].sort();
    const shownDays = dayKeys.slice(0, 5);

    const visual = (
      <Stack gap="sm">
        {shownDays.map((dayKey) => (
          <Stack key={dayKey} gap={4}>
            {dayKeys.length > 1 ? (
              <Text size="xs" fw={600} c="dimmed">
                {clashDayLabel(dayKey, todayKey)}
              </Text>
            ) : null}
            <ClashTimeline
              entries={entries.filter((entry) => coversDay(entry, dayKey))}
              dayKey={dayKey}
            />
          </Stack>
        ))}
        {dayKeys.length > shownDays.length ? (
          <Text size="xs" c="dimmed">
            +{dayKeys.length - shownDays.length} more days
          </Text>
        ) : null}
      </Stack>
    );

    return (
      <>
        <ClashCard
          heading={`Double booking: ${affectedCount} ${affectedCount === 1 ? "person" : "people"}`}
          visual={visual}
        >
          {result.clashes.map((entry) => (
            <ClashEventRow
              key={`${entry.calendarName}:${entry.startNaive}:${entry.title}`}
              entry={entry}
              typeFirst
              onOpen={(rect) => void openDetail(entry, rect)}
              chips={
                <ClashAffectedChips
                  affected={entry.affected}
                  currentUserId={result.currentUserId}
                />
              }
            />
          ))}
          <Text size="xs" c="dimmed">
            You can still save this event — these are warnings only.
          </Text>
        </ClashCard>

        {/* Always mounted so Mantine can play the open/close zoom; `event`
            toggles while `loading` shows the shaped skeleton. */}
        <EventDetail
          event={detailOpen ? (detail?.event ?? null) : null}
          loading={detailOpen && heldDetailLoading}
          onClose={closeDetail}
          readOnly
          zIndex={300}
          onOpenInCalendar={onOpenInCalendar ? (event) => setLeaveEvent(event) : undefined}
          peopleNames={detail?.peopleNames ?? {}}
          calendarNames={detail?.calendarNames ?? {}}
          originRect={detailOrigin}
          currentUserId={result.currentUserId}
          isAdmin={isAdmin}
          myActiveDepartmentIds={detail?.myActiveDepartmentIds ?? []}
          onEdit={() => {}}
          onDuplicate={() => {}}
          onDeleted={() => {}}
          onOptimistic={() => {}}
          onOptimisticSettled={() => {}}
          onOptimisticRollback={() => {}}
        />

        {/* Leaving the wizard discards the draft, so "Open in calendar" is
            confirmed first. Sits above the detail modal (300). */}
        <Modal
          opened={leaveEvent !== null}
          onClose={() => setLeaveEvent(null)}
          title="Discard draft?"
          centered
          size="sm"
          zIndex={310}
        >
          <Text size="sm">
            Opening this event in the calendar will discard your in-progress draft.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setLeaveEvent(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                const target = leaveEvent;
                setLeaveEvent(null);
                if (target) {
                  onOpenInCalendar?.(target);
                }
              }}
            >
              Discard &amp; open
            </Button>
          </Group>
        </Modal>
      </>
    );
  }

  return (
    <Paper withBorder p="sm" role="status" aria-live="polite">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <IconCircleCheck
          size={18}
          style={{ flexShrink: 0, marginTop: 2 }}
          color="var(--mantine-color-green-6)"
          aria-hidden
        />
        <Box>
          <Text size="sm">
            No clashes detected across {result.checkedPeople}{" "}
            {result.checkedPeople === 1 ? "person" : "people"} for this time.
          </Text>
        </Box>
      </Group>
    </Paper>
  );
}
