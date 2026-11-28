"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Group, Paper, Skeleton, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCalendarClock, IconCircleCheck, IconRefresh, IconUserCheck } from "@tabler/icons-react";

import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { PickerFieldTrigger } from "@/components/PickerField";
import { UserSelectModal } from "@/components/UserSelectModal";
import { LoadingStatus } from "@/components/LoadingStatus";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { TimeRangeSelect } from "@/components/TimeRangeSelect";
import { useColdStartContent } from "@/components/ColdStartReady";
import { ClashAffectedChips } from "@/components/clashUi";
import { ClashCard, ClashEventRow } from "@/components/clashCards";
import {
  ClashDayStrip,
  ClashMonthStrip,
  ClashTimelineDays,
  type ClashTimelineEntry,
} from "@/components/clashTimeline";
import { EventDetail } from "../dashboard/EventDetail";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { MIN_SKELETON_HOLD_MS, useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import type { Rect } from "@/lib/motion/origin";
import {
  checkUserClashes,
  getClashEventDetail,
  type EventClashEntry,
  type UserClashCheckResult,
} from "@/lib/events/clashActions";
import {
  DEFAULT_USER_CLASH_AHEAD_MONTHS,
  type UserClashAheadMonths,
} from "@/lib/events/clashRange";
import { RANGE_MONTHS, rangeMonthsLabel } from "@/lib/dateRange/monthRange";
import { buildEventDeepLink } from "@/lib/events/deepLink";
import type { CalendarEvent } from "@/lib/events/queries";
import {
  buildClashDayStrip,
  buildClashMonthStrip,
  clashDayLabel,
  clashEpisodeDayKey,
  clashEpisodeTimeLabel,
  clashStripGranularity,
  clashTypeLabel,
} from "@/lib/events/clashDisplay";
import { formatInstantToNaive } from "@/lib/events/datetime";
import { buildUserGroups, selectionByGroup } from "@/lib/users/userSelect";

type ClashOk = Extract<UserClashCheckResult, { ok: true }>;

/** An active roster user the viewer can scan. */
interface ScanTargetOption {
  id: string;
  name: string;
  shortname: string | null;
  departmentId: string | null;
  departmentName: string | null;
  departmentSort: number | null;
  departmentParentId: string | null;
}

type View =
  { kind: "loading" } | { kind: "error" } | { kind: "done"; result: ClashOk; selfScan: boolean };

function plural(count: number, singular: string, pluralWord: string): string {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

/**
 * The "Double Booking" page: which of a user's *existing* events double-book
 * them over the selected look-ahead (1 / 6 / 12 months, 1 by default). Runs the
 * read-only `checkUserClashes` action on mount and whenever the viewer switches
 * the scan target or the look-ahead. Advisory only — it never writes or changes
 * anything. See docs/user-clashes.md.
 */
export function DoubleBookingView({
  currentUserId,
  isAdmin,
  users,
}: {
  currentUserId: string;
  isAdmin: boolean;
  /** Scan target options (active roster users). Empty when the roster is empty. */
  users: ScanTargetOption[];
}) {
  const router = useRouter();
  const [targetUserId, setTargetUserId] = useState(currentUserId);
  const [aheadMonths, setAheadMonths] = useState<UserClashAheadMonths>(
    DEFAULT_USER_CLASH_AHEAD_MONTHS,
  );
  const [attempt, setAttempt] = useState(0);
  // In-place detail modal: tapping opens it immediately (with a shaped
  // skeleton) and lazily fetches the full payload, so the report never
  // navigates away and there is no spinner/dim.
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
  // Cold-start readiness: the page/view mounts with the route's streamed
  // content, so reporting on mount is exactly "content painted".
  useColdStartContent();
  const [outcome, setOutcome] = useState<{
    targetUserId: string;
    aheadMonths: UserClashAheadMonths;
    attempt: number;
    ok: boolean;
    result: ClashOk | null;
  } | null>(null);

  // Target picker (the shared UserSelectModal badge dialog, single select):
  // options grouped by department with the shortname as a search term, seeded
  // with the currently scanned person on every open.
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const targetPickerGroups = useMemo(
    () =>
      buildUserGroups(
        users.map((user) => ({
          id: user.id,
          label: user.name,
          department: user.departmentName,
          departmentSort: user.departmentSort,
          departmentId: user.departmentId,
          departmentParentId: user.departmentParentId,
          search: user.shortname || undefined,
        })),
      ),
    [users],
  );
  const targetPickerValues = useMemo(
    () => selectionByGroup(targetPickerGroups, [targetUserId]),
    [targetPickerGroups, targetUserId],
  );
  function handleTargetPicked(values: Record<string, string[]>) {
    const picked = Object.values(values).flat();
    const pickedId = picked[0];
    if (pickedId && users.some((user) => user.id === pickedId)) {
      setTargetUserId(pickedId);
    }
  }

  // Open the modal immediately (skeleton) and fetch the tapped event's full
  // payload in the background. A request token supersedes an in-flight fetch
  // when the modal closes or another event is tapped.
  async function openDetail(targetId: string, entry: EventClashEntry, rect: Rect) {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setDetailOrigin(rect);
    setDetail(null);
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const result = await getClashEventDetail({
        targetUserId: targetId,
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
        event: { ...result.event, title: entry.displayLabel ?? result.event.title },
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

  useEffect(() => {
    // Server actions are not cancellable; ignore the result of a superseded
    // scan (unmount, a different target or look-ahead, or a newer attempt) via
    // the cleanup flag. The "loading" view is derived from the request/outcome
    // pair, never set synchronously in the effect.
    let cancelled = false;
    checkUserClashes({ targetUserId, aheadMonths })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setOutcome(
          result.ok
            ? { targetUserId, aheadMonths, attempt, ok: true, result }
            : { targetUserId, aheadMonths, attempt, ok: false, result: null },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setOutcome({ targetUserId, aheadMonths, attempt, ok: false, result: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [targetUserId, aheadMonths, attempt]);

  let view: View;
  if (
    outcome &&
    outcome.targetUserId === targetUserId &&
    outcome.aheadMonths === aheadMonths &&
    outcome.attempt === attempt &&
    outcome.ok &&
    outcome.result
  ) {
    view = { kind: "done", result: outcome.result, selfScan: targetUserId === currentUserId };
  } else if (
    outcome &&
    outcome.targetUserId === targetUserId &&
    outcome.aheadMonths === aheadMonths &&
    outcome.attempt === attempt
  ) {
    view = { kind: "error" };
  } else {
    view = { kind: "loading" };
  }

  // The scan target's label: name + department where both are known (the bare
  // id only ever shows for a user who vanished from the roster mid-session).
  const selfScan = targetUserId === currentUserId;
  const targetOption = users.find((user) => user.id === targetUserId);
  const targetLabel = targetOption
    ? targetOption.departmentName
      ? `${targetOption.name} · ${targetOption.departmentName}`
      : targetOption.name
    : targetUserId;

  return (
    <Stack gap="md" pb="xl" className={CONTENT_ENTER_CLASS}>
      {/* The pinned chrome: the head block (title + target picker + look-ahead)
          stuck under the app header while the clash groups scroll beneath it —
          the shared sticky-chrome recipe (`.c2-report-chrome` +
          `.c2-report-head`, `globals.css`; docs/user-clashes.md §1.8). */}
      <Box className="c2-glass-surface c2-report-chrome">
        <div className="c2-report-head">
          <div className="c2-report-title">
            <PageHeader title="Double Booking" subtitle={subtitleFor(view)} />
          </div>
          <div className="c2-report-controls">
            {users.length > 0 && (
              <div className="c2-report-picker">
                {/* One control at every width, riding the same field-look pill as
                    the look-ahead menu beside it (`.c2-field-trigger`) — the two
                    can no longer drift in height, border, fill or type. The
                    default self scan reads as an action ("Check someone"); a
                    picked target names themselves and their department, reopens
                    the dialog from the pill (one tap to switch) and keeps the ✕
                    (one tap back to your own schedule). */}
                <PickerFieldTrigger
                  icon={<IconUserCheck size={18} />}
                  value={selfScan ? "Check someone" : targetLabel}
                  ariaLabel={selfScan ? undefined : `Check someone — currently ${targetLabel}`}
                  onOpen={() => setTargetPickerOpen(true)}
                  onClear={selfScan ? undefined : () => setTargetUserId(currentUserId)}
                  clearLabel="Back to my schedule"
                />
              </div>
            )}
            <div className="c2-report-range">
              <TimeRangeSelect
                label="Look ahead"
                values={RANGE_MONTHS}
                labelFor={(months) => rangeMonthsLabel(months, "forward")}
                months={aheadMonths}
                onSelect={setAheadMonths}
                disabled={view.kind === "loading"}
              />
            </div>
          </div>
        </div>
      </Box>

      <CrossfadeSwap
        loading={view.kind === "loading"}
        minHoldMs={MIN_SKELETON_HOLD_MS}
        mode="overlay"
        skeleton={
          <Paper withBorder p="sm">
            <LoadingStatus label="Checking for double bookings" />
            <Stack gap={6}>
              <Skeleton height={10} radius="sm" />
              <Skeleton height={10} radius="sm" width="85%" />
              <Skeleton height={10} radius="sm" width="65%" />
            </Stack>
          </Paper>
        }
      >
        {view.kind === "loading" ? null : renderContent(view)}
      </CrossfadeSwap>

      {users.length > 0 && (
        <UserSelectModal
          opened={targetPickerOpen}
          onClose={() => setTargetPickerOpen(false)}
          groups={targetPickerGroups}
          values={targetPickerValues}
          onConfirm={handleTargetPicked}
          title="Select a person to check"
          confirmLabel="Check person"
          single
        />
      )}

      {/* Always mounted so Mantine can play the open/close zoom; `event` toggles
          while `loading` shows the shaped skeleton. */}
      <EventDetail
        event={detailOpen ? (detail?.event ?? null) : null}
        loading={detailOpen && heldDetailLoading}
        onClose={closeDetail}
        readOnly
        onOpenInCalendar={(event) => {
          router.push(
            buildEventDeepLink({
              view: null,
              start: event.start,
              eventId: event.payload.eventId,
              calendarId: event.payload.calendarId,
            }),
          );
        }}
        peopleNames={detail?.peopleNames ?? {}}
        calendarNames={detail?.calendarNames ?? {}}
        originRect={detailOrigin}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        myActiveDepartmentIds={detail?.myActiveDepartmentIds ?? []}
        onEdit={() => {}}
        onDuplicate={() => {}}
        onDeleted={() => {}}
        onOptimistic={() => {}}
        onOptimisticSettled={() => {}}
        onOptimisticRollback={() => {}}
      />
    </Stack>
  );

  function subtitleFor(current: View): string | undefined {
    // The result states carry their own summary (the status line, the strip, or
    // the empty state), so the header only orients while loading.
    return current.kind === "loading" ? "Checking existing events…" : undefined;
  }

  function jumpToDay(dayKey: string) {
    const target = document.getElementById(`c2-db-day-${dayKey}`);
    if (!target) {
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  function renderContent(current: Exclude<View, { kind: "loading" }>) {
    if (current.kind === "error") {
      return (
        <Paper withBorder p="sm">
          <Group justify="space-between" align="center" gap="xs" wrap="wrap">
            <Text size="xs" c="dimmed">
              Could not check for double bookings.
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

    const { result } = current;
    const isSelf = selfScan;
    const personLabel = isSelf ? "you" : result.targetName;

    if (result.skipReason === "no-department") {
      return (
        <EmptyState
          icon={<IconCalendarClock size={18} />}
          description={
            isSelf
              ? "You are not assigned to a department, so there is no schedule to compare."
              : `${result.targetName} is not assigned to a department, so there is no schedule to compare.`
          }
        />
      );
    }

    if (result.skipReason === "no-active-user") {
      return (
        <EmptyState
          icon={<IconCalendarClock size={18} />}
          description={`${result.targetName} is no longer an active user.`}
        />
      );
    }

    if (result.groups.length === 0) {
      const ahead = rangeMonthsLabel(result.aheadMonths, "forward");
      return (
        <Box role="status" aria-live="polite">
          <EmptyState
            icon={<IconCircleCheck size={18} />}
            description={
              isSelf
                ? `No double bookings in the next ${ahead} — your schedule is clear.`
                : `${result.targetName} has no double bookings in the next ${ahead}.`
            }
            actionLabel="Open calendar"
            actionHref="/dashboard"
          />
        </Box>
      );
    }

    // An episode is filed under the first day where two entries actually
    // overlap (`clashEpisodeDayKey`), not under its first event's start day —
    // a run that only collides from day two belongs under day two. That key
    // can reorder episodes, so sort before the single forward pass.
    const todayKey = formatInstantToNaive(new Date()).slice(0, 10);
    const episodes = result.groups
      .map((group) => ({
        group,
        dayKey: clashEpisodeDayKey(
          group.events.map((entry) => ({
            startNaive: entry.effectiveStartNaive,
            endNaive: entry.effectiveEndNaive,
            occupiesFullDay: entry.occupiesFullDay,
          })),
        ),
      }))
      .sort((a, b) => (a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0));
    const dayGroups: { dayKey: string; groups: typeof result.groups }[] = [];
    for (const { group, dayKey } of episodes) {
      const last = dayGroups[dayGroups.length - 1];
      if (last && last.dayKey === dayKey) {
        last.groups.push(group);
      } else {
        dayGroups.push({ dayKey, groups: [group] });
      }
    }
    const conflictDayKeys = dayGroups.map((day) => day.dayKey);
    const aheadLabel = rangeMonthsLabel(result.aheadMonths, "forward");
    // One cell per day for a short look-ahead; a 6- or 12-month scan would
    // otherwise render 180–365 boxes in a row, so it switches to one per month.
    const monthStrip =
      clashStripGranularity(result.rangeStartDate, result.rangeEndDate) === "month"
        ? buildClashMonthStrip(
            result.rangeStartDate,
            result.rangeEndDate,
            conflictDayKeys,
            todayKey,
          )
        : null;

    return (
      <Stack gap="lg">
        <Text fz="sm" c="dimmed" role="status" aria-live="polite">
          {isSelf ? "You have" : `${result.targetName} has`}{" "}
          {plural(result.groups.length, "double booking", "double bookings")} in the next{" "}
          {aheadLabel}.
        </Text>
        {monthStrip ? (
          <ClashMonthStrip cells={monthStrip} rangeLabel={aheadLabel} onJump={jumpToDay} />
        ) : (
          <ClashDayStrip
            days={buildClashDayStrip(result.rangeStartDate, result.rangeEndDate, conflictDayKeys)}
            todayKey={todayKey}
            rangeLabel={aheadLabel}
            onJump={jumpToDay}
          />
        )}
        {dayGroups.map(({ dayKey, groups }) => (
          <Stack key={dayKey} gap="sm" id={`c2-db-day-${dayKey}`} className="c2-db-day">
            {/* `h2` directly under the page's `h1` — the day is this page's only
                section level (docs/accessibility.md §1.10). */}
            <Text component="h2" fw={600} size="sm" c="dimmed">
              {clashDayLabel(dayKey, todayKey)}
            </Text>
            {groups.map((group, groupIndex) => {
              const count = group.events.length;
              const timelineEntries: ClashTimelineEntry[] = group.events.map((entry) => ({
                startNaive: entry.effectiveStartNaive,
                endNaive: entry.effectiveEndNaive,
                occupiesFullDay: entry.occupiesFullDay,
                label: entry.displayLabel ?? clashTypeLabel(entry),
                title: entry.title,
                color: entry.color,
                onSelect: (rect) => void openDetail(result.targetUserId, entry, rect),
              }));
              const countLabel = plural(count, "event", "events");
              const secondary = isSelf ? countLabel : `${result.targetName} · ${countLabel}`;
              return (
                <ClashCard
                  key={`${dayKey}:${groupIndex}`}
                  heading={clashEpisodeTimeLabel(group.events)}
                  headingSecondary={secondary}
                  visual={
                    <ClashTimelineDays
                      entries={timelineEntries}
                      todayKey={todayKey}
                      minEntriesPerDay={2}
                    />
                  }
                  live={false}
                  summaryBelow={
                    <ClashAffectedChips
                      affected={group.events[0].affected}
                      currentUserId={currentUserId}
                      omitUserId={result.targetUserId}
                    />
                  }
                >
                  {group.events.map((entry, eventIndex) => (
                    <ClashEventRow
                      key={`${entry.calendarName}:${entry.startNaive}:${entry.title}:${eventIndex}`}
                      entry={entry}
                      typeFirst
                      onOpen={(rect) => void openDetail(result.targetUserId, entry, rect)}
                    />
                  ))}
                </ClashCard>
              );
            })}
          </Stack>
        ))}
        <Text fz="xs" c="dimmed">
          Only events involving {personLabel} are listed. Select an event to view its details —
          warnings only.
        </Text>
      </Stack>
    );
  }
}
