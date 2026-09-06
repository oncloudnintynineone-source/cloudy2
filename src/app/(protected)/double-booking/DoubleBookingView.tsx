"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Group, Loader, Paper, Skeleton, Stack, Text } from "@mantine/core";
import dayjs from "dayjs";
import {
  IconAlertTriangle,
  IconCalendarClock,
  IconCircleCheck,
  IconRefresh,
} from "@tabler/icons-react";

import { PickerField, type PickerBadgeItem } from "@/components/PickerField";
import { UserSelectModal } from "@/components/UserSelectModal";
import { LoadingStatus } from "@/components/LoadingStatus";
import { EmptyState } from "@/components/EmptyState";
import { useColdStartContent } from "@/components/ColdStartReady";
import { ClashAffectedChips, eventWhenLabel } from "@/components/clashUi";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { checkUserClashes, type UserClashCheckResult } from "@/lib/events/clashActions";
import { buildUserGroups, selectionByGroup } from "@/lib/users/userSelect";

type ClashOk = Extract<UserClashCheckResult, { ok: true }>;

/** A roster user an admin can scan. */
interface ScanTargetOption {
  id: string;
  name: string;
  shortname: string | null;
  departmentId: string | null;
  departmentName: string | null;
}

type View =
  { kind: "loading" } | { kind: "error" } | { kind: "done"; result: ClashOk; selfScan: boolean };

function formatDateOnly(dateOnly: string): string {
  return dayjs(dateOnly).format("MMM D, YYYY");
}

function plural(count: number, singular: string, pluralWord: string): string {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

/**
 * The "Double Booking" page: which of a user's *existing* events double-book
 * them over the next 30 days. Runs the read-only `checkUserClashes` action on
 * mount and whenever an admin switches the scan target. Advisory only — it
 * never writes or changes anything. See docs/user-clashes.md.
 */
export function DoubleBookingView({
  currentUserId,
  isAdmin,
  users,
}: {
  currentUserId: string;
  isAdmin: boolean;
  /** Admin target options (active roster users). Empty for regular users. */
  users: ScanTargetOption[];
}) {
  const [targetUserId, setTargetUserId] = useState(currentUserId);
  const [attempt, setAttempt] = useState(0);
  // Cold-start readiness: the page/view mounts with the route's streamed
  // content, so reporting on mount is exactly "content painted".
  useColdStartContent();
  const [outcome, setOutcome] = useState<{
    targetUserId: string;
    attempt: number;
    ok: boolean;
    result: ClashOk | null;
  } | null>(null);

  // Admin target picker (the shared UserSelectModal badge dialog, single
  // select): options grouped by department with the shortname as a search
  // term, seeded with the currently scanned person on every open.
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const targetPickerGroups = useMemo(
    () =>
      buildUserGroups(
        users.map((user) => ({
          id: user.id,
          label: user.name,
          department: user.departmentName,
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

  useEffect(() => {
    // Server actions are not cancellable; ignore the result of a superseded
    // scan (unmount, a different target, or a newer attempt) via the cleanup
    // flag. The "loading" view is derived from the request/outcome pair, never
    // set synchronously in the effect.
    let cancelled = false;
    checkUserClashes({ targetUserId })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setOutcome(
          result.ok
            ? { targetUserId, attempt, ok: true, result }
            : { targetUserId, attempt, ok: false, result: null },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setOutcome({ targetUserId, attempt, ok: false, result: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [targetUserId, attempt]);

  let view: View;
  if (
    outcome &&
    outcome.targetUserId === targetUserId &&
    outcome.attempt === attempt &&
    outcome.ok &&
    outcome.result
  ) {
    view = { kind: "done", result: outcome.result, selfScan: targetUserId === currentUserId };
  } else if (outcome && outcome.targetUserId === targetUserId && outcome.attempt === attempt) {
    view = { kind: "error" };
  } else {
    view = { kind: "loading" };
  }

  // The name of the currently scanned person, for the admin picker + header.
  const selfScan = targetUserId === currentUserId;
  const targetOption = users.find((user) => user.id === targetUserId);
  const targetName = selfScan ? null : (targetOption?.name ?? null);
  const personForHeader = selfScan ? "you" : (targetName ?? "this person");
  // The single summary badge for the admin picker (hidden while self-scanning).
  const targetSummaryItem: PickerBadgeItem = {
    key: targetUserId,
    label: targetOption
      ? targetOption.departmentName
        ? `${targetOption.name} · ${targetOption.departmentName}`
        : targetOption.name
      : targetUserId,
    color: "brand",
  };

  return (
    <Stack gap="md" p="md" pb="xl" className={CONTENT_ENTER_CLASS}>
      <div className="c2-db-head">
        <Stack gap={2} className="c2-db-title">
          <Text fw={600} size="lg">
            Double Booking
          </Text>
          <Text fz="sm" c="dimmed">
            {subtitleFor(view)}
          </Text>
        </Stack>
        {isAdmin && (
          <div className="c2-db-picker">
            <PickerField
              label="Check another person"
              items={selfScan ? [] : [targetSummaryItem]}
              empty={
                selfScan ? (
                  <Text size="xs" c="dimmed">
                    Checking your own schedule
                  </Text>
                ) : null
              }
              onOpen={() => setTargetPickerOpen(true)}
            />
          </div>
        )}
      </div>

      {renderContent(view)}

      {isAdmin && (
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
    </Stack>
  );

  function subtitleFor(current: View): string {
    if (current.kind === "loading") {
      return `Checking existing events for ${personForHeader} over the next 30 days…`;
    }
    if (current.kind === "error") {
      return "Could not check for double bookings.";
    }
    if (current.result.skipReason === "no-department") {
      return selfScan
        ? "Your schedule can't be checked right now."
        : `${current.result.targetName}'s schedule can't be checked right now.`;
    }
    if (current.result.skipReason === "no-active-user") {
      return selfScan
        ? "Your schedule can't be checked right now."
        : `${current.result.targetName}'s schedule can't be checked right now.`;
    }
    return selfScan
      ? "Existing events that keep you busy at overlapping times — the next 30 days."
      : `Existing events that keep ${current.result.targetName} busy at overlapping times — the next 30 days.`;
  }

  function renderContent(current: View) {
    if (current.kind === "loading") {
      return (
        <Paper withBorder p="sm">
          <LoadingStatus label="Checking for double bookings" />
          <Stack gap={6}>
            <Group gap={6} c="dimmed">
              <Loader size="xs" />
              <Text size="xs">Checking for double bookings…</Text>
            </Group>
            <Skeleton height={10} radius="sm" />
            <Skeleton height={10} radius="sm" width="85%" />
            <Skeleton height={10} radius="sm" width="65%" />
          </Stack>
        </Paper>
      );
    }

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
      return (
        <Stack gap="sm">
          <Text fz="sm" c="dimmed" role="status" aria-live="polite">
            No double bookings from {formatDateOnly(result.rangeStartDate)} to{" "}
            {formatDateOnly(result.rangeEndDate)}.
          </Text>
          <EmptyState
            icon={<IconCircleCheck size={18} />}
            description={
              isSelf
                ? "All clear — none of your existing events overlap for the next 30 days."
                : `${result.targetName} is all clear — none of their existing events overlap for the next 30 days.`
            }
          />
        </Stack>
      );
    }

    const clashingEventCount = result.groups.reduce(
      (total, group) => total + group.events.length,
      0,
    );
    return (
      <Stack gap="md">
        <Text fz="sm" c="dimmed" role="status" aria-live="polite">
          {plural(result.groups.length, "overlap found", "overlaps found")} across{" "}
          {plural(clashingEventCount, "event", "events")}, from{" "}
          {formatDateOnly(result.rangeStartDate)} to {formatDateOnly(result.rangeEndDate)}.
        </Text>
        {result.groups.map((group, groupIndex) => {
          const doubleBooked = (count: number) =>
            isSelf
              ? `You're double-booked by ${count} overlapping ${count === 1 ? "event" : "events"}`
              : `${result.targetName} is double-booked by ${count} overlapping ${
                  count === 1 ? "event" : "events"
                }`;
          return (
            <Paper
              key={groupIndex}
              withBorder
              p="sm"
              role="status"
              aria-live="polite"
              style={{ borderColor: "var(--mantine-color-orange-4)" }}
            >
              <Stack gap="xs">
                <Group gap="sm" align="flex-start" wrap="nowrap">
                  <IconAlertTriangle
                    size={18}
                    style={{ flexShrink: 0, marginTop: 2 }}
                    color="var(--mantine-color-orange-6)"
                    aria-hidden
                  />
                  <Stack gap={4} style={{ flexGrow: 1 }}>
                    <Text size="sm" fw={500} c="orange.8">
                      {doubleBooked(group.events.length)}
                    </Text>
                    <ClashAffectedChips
                      affected={group.events[0].affected}
                      currentUserId={currentUserId}
                    />
                    <Stack gap="sm" mt={4}>
                      {group.events.map((entry, eventIndex) => (
                        <Stack
                          key={`${entry.calendarName}:${entry.startNaive}:${entry.title}:${eventIndex}`}
                          gap={2}
                        >
                          <Group gap={6} wrap="wrap">
                            <Text size="sm" fw={600} style={{ overflowWrap: "anywhere" }}>
                              {entry.title}
                            </Text>
                            {entry.external && (
                              <Badge size="xs" variant="light" color="gray">
                                External
                              </Badge>
                            )}
                          </Group>
                          <Text size="xs" c="dimmed">
                            {eventWhenLabel(entry)} · {entry.calendarName}
                          </Text>
                        </Stack>
                      ))}
                    </Stack>
                  </Stack>
                </Group>
              </Stack>
            </Paper>
          );
        })}
        <Text fz="xs" c="dimmed">
          Only events that occupy {personLabel} are compared — unrelated events that merely overlap
          in time are ignored. Double bookings are warnings only; nothing here is changed or saved.
        </Text>
      </Stack>
    );
  }
}
