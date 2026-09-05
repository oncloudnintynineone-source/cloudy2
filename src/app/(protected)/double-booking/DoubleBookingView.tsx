"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Group, Paper, SelectProps, Skeleton, Stack, Text } from "@mantine/core";
import dayjs from "dayjs";
import {
  IconAlertTriangle,
  IconCalendarClock,
  IconCircleCheck,
  IconRefresh,
} from "@tabler/icons-react";

import { NoKeyboardSelect } from "@/components/NoKeyboardSelect";
import { LoadingStatus } from "@/components/LoadingStatus";
import { EmptyState } from "@/components/EmptyState";
import { ClashAffectedChips, eventWhenLabel } from "@/components/clashUi";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { checkUserClashes, type UserClashCheckResult } from "@/lib/events/clashActions";

type ClashOk = Extract<UserClashCheckResult, { ok: true }>;

/** A roster user an admin can scan. */
interface ScanTargetOption {
  id: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
}

type View =
  { kind: "loading" } | { kind: "error" } | { kind: "done"; result: ClashOk; selfScan: boolean };

function formatDateOnly(dateOnly: string): string {
  return dayjs(dateOnly).format("MMM D, YYYY");
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
  const [outcome, setOutcome] = useState<{
    targetUserId: string;
    attempt: number;
    ok: boolean;
    result: ClashOk | null;
  } | null>(null);

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

  const targetOptions: SelectProps["data"] = users.map((user) => ({
    value: user.id,
    label: user.departmentName ? `${user.name} · ${user.departmentName}` : user.name,
  }));

  return (
    <Stack gap="md" p="md" pb="xl" className={CONTENT_ENTER_CLASS}>
      <Stack gap={2}>
        <Text fw={600} size="lg">
          Double Booking
        </Text>
        <Text fz="sm" c="dimmed">
          {view.kind === "done"
            ? view.selfScan
              ? "Existing events that double-book you in the next 30 days."
              : `Existing events that double-book ${view.result.targetName} in the next 30 days.`
            : "Check your existing events for double bookings in the next 30 days."}
        </Text>
      </Stack>

      {isAdmin && (
        <NoKeyboardSelect
          label="Check another person"
          value={targetUserId}
          onChange={(value) => {
            if (value && users.some((user) => user.id === value)) {
              setTargetUserId(value);
            }
          }}
          data={targetOptions}
          searchable
          clearable={false}
          maxDropdownHeight={300}
          styles={{
            root: { maxWidth: 320 },
          }}
          aria-label="Person to check for double bookings"
        />
      )}

      {renderContent(view)}
    </Stack>
  );

  function renderContent(current: View) {
    if (current.kind === "loading") {
      return (
        <Paper withBorder p="sm">
          <LoadingStatus label="Checking for double bookings" />
          <Stack gap={6}>
            <Group gap={6} c="dimmed">
              <Text size="xs">Checking for double bookings…</Text>
            </Group>
            <Skeleton height={10} radius="sm" />
            <Skeleton height={10} radius="sm" width="80%" />
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

    const { result, selfScan } = current;
    const personLabel = selfScan ? "you" : result.targetName;

    if (result.skipReason === "no-department") {
      return (
        <EmptyState
          icon={<IconCalendarClock size={18} />}
          description={
            selfScan
              ? "You are not assigned to a department, so nothing can be checked for double bookings."
              : `${result.targetName} is not assigned to a department, so nothing can be checked for double bookings.`
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
        <>
          <Text fz="sm" c="dimmed">
            Scanned {personLabel === "you" ? "your" : `${result.targetName}'s`} existing events from{" "}
            {formatDateOnly(result.rangeStartDate)} to {formatDateOnly(result.rangeEndDate)}.
          </Text>
          <EmptyState
            icon={<IconCircleCheck size={18} />}
            description={`No double bookings found for ${personLabel} in the next 30 days.`}
          />
        </>
      );
    }

    const clashingEventCount = result.groups.reduce(
      (total, group) => total + group.events.length,
      0,
    );
    return (
      <Stack gap="md">
        <Text fz="sm" c="dimmed">
          {result.groups.length} {result.groups.length === 1 ? "overlap" : "overlaps"} found across{" "}
          {clashingEventCount} events, from {formatDateOnly(result.rangeStartDate)} to{" "}
          {formatDateOnly(result.rangeEndDate)}.
        </Text>
        {result.groups.map((group, groupIndex) => (
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
                    {group.events.length} overlapping events double-book {personLabel}
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
        ))}
      </Stack>
    );
  }
}
