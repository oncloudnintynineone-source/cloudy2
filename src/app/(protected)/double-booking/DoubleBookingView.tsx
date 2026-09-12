"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Button, Group, Paper, Skeleton, Stack, Text } from "@mantine/core";
import { IconCalendarClock, IconCircleCheck, IconRefresh } from "@tabler/icons-react";

import { PickerField, type PickerBadgeItem } from "@/components/PickerField";
import { UserSelectModal } from "@/components/UserSelectModal";
import { LoadingStatus } from "@/components/LoadingStatus";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { useColdStartContent } from "@/components/ColdStartReady";
import { ClashAffectedChips, clashTitlesPreview } from "@/components/clashUi";
import { ClashCard, ClashEventRow } from "@/components/clashCards";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { checkUserClashes, type UserClashCheckResult } from "@/lib/events/clashActions";
import { buildEventDeepLink } from "@/lib/events/deepLink";
import {
  clashDayKey,
  clashDayLabel,
  clashEpisodeWindow,
  clashTimeLabel,
} from "@/lib/events/clashDisplay";
import { formatInstantToNaive } from "@/lib/events/datetime";
import { buildUserGroups, selectionByGroup } from "@/lib/users/userSelect";

type ClashOk = Extract<UserClashCheckResult, { ok: true }>;

/** A roster user an admin can scan. */
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

  // The single summary badge for the admin picker (hidden while self-scanning).
  const selfScan = targetUserId === currentUserId;
  const targetOption = users.find((user) => user.id === targetUserId);
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
    <Stack gap="md" pb="xl" className={CONTENT_ENTER_CLASS}>
      <div className="c2-db-head">
        <div className="c2-db-title">
          <PageHeader title="Double Booking" subtitle={subtitleFor(view)} />
        </div>
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

  function subtitleFor(current: View): string | undefined {
    if (current.kind === "loading") {
      return "Checking existing events…";
    }
    if (current.kind === "error") {
      return undefined;
    }
    if (current.result.skipReason !== null) {
      return selfScan
        ? "Your schedule can't be checked right now."
        : `${current.result.targetName}'s schedule can't be checked right now.`;
    }
    return selfScan
      ? "Existing overlaps in your next 30 days."
      : `Existing overlaps in ${current.result.targetName}'s next 30 days.`;
  }

  function renderContent(current: View) {
    if (current.kind === "loading") {
      return (
        <Paper withBorder p="sm">
          <LoadingStatus label="Checking for double bookings" />
          <Stack gap={6}>
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
        <Box role="status" aria-live="polite">
          <EmptyState
            icon={<IconCircleCheck size={18} />}
            description={
              isSelf
                ? "No double bookings in the next 30 days — your schedule is clear."
                : `${result.targetName} has no double bookings in the next 30 days.`
            }
            actionLabel="Open calendar"
            actionHref="/dashboard"
          />
        </Box>
      );
    }

    // Groups arrive chronological by earliest event, so a single forward pass
    // buckets them into consecutive days (an episode is filed under its first
    // day, even when it runs past midnight).
    const todayKey = formatInstantToNaive(new Date()).slice(0, 10);
    const dayGroups: { dayKey: string; groups: typeof result.groups }[] = [];
    for (const group of result.groups) {
      const dayKey = clashDayKey(group.events[0].startNaive);
      const last = dayGroups[dayGroups.length - 1];
      if (last && last.dayKey === dayKey) {
        last.groups.push(group);
      } else {
        dayGroups.push({ dayKey, groups: [group] });
      }
    }

    return (
      <Stack gap="lg">
        <Text fz="sm" c="dimmed" role="status" aria-live="polite">
          {plural(result.groups.length, "double booking", "double bookings")} in the next 30 days.
        </Text>
        {dayGroups.map(({ dayKey, groups }) => (
          <Stack key={dayKey} gap="sm">
            <Text component="h3" fw={600} size="sm" c="dimmed">
              {clashDayLabel(dayKey, todayKey)}
            </Text>
            {groups.map((group, groupIndex) => {
              const count = group.events.length;
              const titles = clashTitlesPreview(group.events);
              const countLabel = plural(count, "event", "events");
              const secondary = isSelf
                ? `${countLabel}${titles ? ` · ${titles}` : ""}`
                : `${result.targetName} · ${countLabel}${titles ? ` · ${titles}` : ""}`;
              return (
                <ClashCard
                  key={`${dayKey}:${groupIndex}`}
                  heading={clashTimeLabel(clashEpisodeWindow(group.events))}
                  headingSecondary={secondary}
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
                      href={buildEventDeepLink({
                        view: null,
                        start: entry.startNaive,
                        eventId: entry.eventId,
                        calendarId: entry.calendarId,
                      })}
                    />
                  ))}
                </ClashCard>
              );
            })}
          </Stack>
        ))}
        <Text fz="xs" c="dimmed">
          Only events involving {personLabel} are listed. Select an event to open it — warnings
          only.
        </Text>
      </Stack>
    );
  }
}
