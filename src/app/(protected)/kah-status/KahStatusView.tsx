"use client";

import { useRef, useState, useTransition } from "react";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { Badge, Box, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCircleCheck, IconRefresh, IconUsersGroup } from "@tabler/icons-react";

import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { TimeRangeSelect } from "@/components/TimeRangeSelect";
import { useColdStartContent } from "@/components/ColdStartReady";
import { ClashCard, ClashEventRow } from "@/components/clashCards";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { capBadgeItems } from "@/lib/ui/badgeCap";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { MIN_SKELETON_HOLD_MS, useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import type { Rect } from "@/lib/motion/origin";
import type { EventClashEntry } from "@/lib/events/clashActions";
import { clashDayLabel } from "@/lib/events/clashDisplay";
import { formatInstantToNaive } from "@/lib/events/datetime";
import { buildEventDeepLink } from "@/lib/events/deepLink";
import type { CalendarEvent } from "@/lib/events/queries";
import {
  KAH_RANGE_MONTHS,
  kahRangeLabel,
  type KahEpisodeRow,
  type KahMember,
  type KahRangeMonths,
  type KahStatusViewData,
} from "@/lib/kah/range";
import { getKahBreachEventDetail, getKahStatusView } from "@/lib/kah/statusActions";

import { EventDetail } from "../dashboard/EventDetail";
import { KahStatusSkeleton } from "./KahStatusSkeleton";

interface KahStatusViewProps {
  initial: KahStatusViewData;
  /** Id of the signed-in user, emphasised in the member chips. */
  currentUserId: string;
}

type EpisodeStatus = KahEpisodeRow["status"];

function statusBadge(status: EpisodeStatus) {
  if (status === "active") {
    return (
      <Badge size="sm" variant="light" color="red">
        Active
      </Badge>
    );
  }
  if (status === "upcoming") {
    return (
      <Badge size="sm" variant="light" color="yellow">
        Upcoming
      </Badge>
    );
  }
  return (
    <Badge size="sm" variant="light" color="green">
      Resolved
    </Badge>
  );
}

/**
 * "Aug 12 – Aug 16" (year shown when the run crosses one). A run clipped at
 * the window start reads "Ongoing" (it began before today); one clipped at
 * the window end gets a "+" (it may extend past the look-ahead).
 */
function periodLabel(episode: KahEpisodeRow): string {
  const crossesYear = dayjs(episode.startDate).year() !== dayjs(episode.endDate).year();
  const fmt = (date: string) => dayjs(date).format(crossesYear ? "MMM D, YYYY" : "MMM D");
  const start = episode.clippedStart ? "Ongoing" : fmt(episode.startDate);
  const end = episode.clippedEnd ? `${fmt(episode.endDate)}+` : fmt(episode.endDate);
  return `${start} – ${end}`;
}

function dayCount(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * The group roster as badges: away members in red, in-country members muted, and
 * the signed-in user emphasised (accent). Capped through the shared
 * `capBadgeItems` recipe (C6) so a large group stays readable and the "(You)"
 * chip is pinned first — it can never disappear behind the cap.
 */
function MemberChips({ members, currentUserId }: { members: KahMember[]; currentUserId: string }) {
  const ordered = [...members.filter((member) => member.away), ...members.filter((m) => !m.away)];
  const { visible, overflow } = capBadgeItems(
    ordered,
    14,
    (member) => member.userId === currentUserId,
  );
  return (
    <Group gap={4} wrap="wrap">
      {visible.map((member) => {
        const isYou = member.userId === currentUserId;
        return (
          <Badge
            key={member.userId}
            size="xs"
            variant={isYou ? "filled" : "light"}
            color={isYou ? "accent" : member.away ? "red" : "gray"}
            title={member.away ? "Away at some point during this period" : undefined}
          >
            {isYou ? `${member.name} (You)` : member.name}
          </Badge>
        );
      })}
      {overflow > 0 && (
        <Text size="xs" c="dimmed">
          +{overflow} more
        </Text>
      )}
    </Group>
  );
}

export function KahStatusView({ initial, currentUserId }: KahStatusViewProps) {
  const router = useRouter();
  // The look-ahead is a per-view choice only — never persisted. The server
  // renders the default range, and a change re-fetches through the action; a
  // refresh remounts this view and resets to the default.
  const [data, setData] = useState<KahStatusViewData>(initial);
  const [rangeMonths, setRangeMonths] = useState<KahRangeMonths>(initial.rangeMonths);
  // A failed look-ahead change keeps the last good window on screen and shows
  // the inline error + Retry strip (the Double Booking recipe) instead of a
  // toast that vanishes with no way back.
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { windowStart, windowEnd, allGroups, episodes, allClearGroups } = data;

  const windowLabel = `${dayjs(windowStart).format("MMM D, YYYY")} – ${dayjs(windowEnd).format(
    "MMM D, YYYY",
  )}`;
  // Civil "today" for the worst-day labels (Today / Tomorrow / Mon 14 Sep).
  const todayKey = formatInstantToNaive(new Date()).slice(0, 10);
  // Cold-start readiness: this view only mounts after the server computed the
  // whole window, so reporting on mount is exactly "content painted".
  useColdStartContent();

  function loadRange(months: KahRangeMonths) {
    startTransition(async () => {
      const result = await getKahStatusView({ rangeMonths: months });
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  // The shared control only ever reports a selectable window, so no coercion is
  // needed here (the server action still re-parses its input defensively).
  function handleRangeChange(next: KahRangeMonths) {
    if (next === rangeMonths) {
      return;
    }
    setRangeMonths(next);
    loadRange(next);
  }

  // In-place detail modal: opens immediately (shaped skeleton) and lazily fetches
  // the tapped event's full payload. A request token supersedes an in-flight
  // fetch on close or another tap.
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

  async function openDetail(entry: EventClashEntry, rect: Rect) {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setDetailOrigin(rect);
    setDetail(null);
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const result = await getKahBreachEventDetail({
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

  const statusSummary = (["active", "upcoming", "resolved"] as const)
    .map((status) => {
      const count = episodes.filter((episode) => episode.status === status).length;
      return count > 0 ? `${count} ${status}` : null;
    })
    .filter((part): part is string => part !== null)
    .join(", ");

  const hasContent = episodes.length > 0 || allClearGroups.length > 0;

  return (
    <Stack gap="md" pb="xl" className={CONTENT_ENTER_CLASS}>
      {/* The pinned chrome: the head block (title + look-ahead control) stuck
          under the app header while the breach cards scroll beneath it — the
          shared sticky-chrome recipe (docs/dashboard-views.md, SettingsTabs),
          same as Double Booking and My Events. The admin-view hint rides the
          subtitle so the chrome stays two lines. */}
      <Box
        className="c2-glass-surface"
        style={{
          position: "sticky",
          top: "var(--app-shell-header-offset)",
          zIndex: 9,
          borderBottom: "1px solid var(--mantine-color-default-border)",
          marginInline: "calc(-1 * var(--app-shell-padding))",
          marginTop: "calc(-1 * var(--app-shell-padding))",
          paddingInline: "var(--app-shell-padding)",
          paddingTop: "var(--mantine-spacing-md)",
          paddingBottom: "var(--mantine-spacing-md)",
        }}
      >
        <div className="c2-report-head">
          <div className="c2-report-title">
            <PageHeader
              title="KAH Status"
              subtitle={
                allGroups ? `${windowLabel} · Admin view — showing all KAH groups` : windowLabel
              }
            />
          </div>
          <div className="c2-report-controls">
            <div className="c2-report-range">
              <TimeRangeSelect
                label="Look ahead"
                values={KAH_RANGE_MONTHS}
                labelFor={kahRangeLabel}
                months={rangeMonths}
                onSelect={handleRangeChange}
                disabled={pending}
              />
            </div>
          </div>
        </div>
      </Box>

      {error ? (
        <Paper withBorder p="sm">
          <Group justify="space-between" align="center" gap="xs" wrap="wrap">
            <Text size="xs" c="dimmed">
              Could not load the KAH forecast for this look-ahead.
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<IconRefresh size={12} />}
              loading={pending}
              loaderProps={BUTTON_LOADER_PROPS}
              onClick={() => loadRange(rangeMonths)}
            >
              Retry
            </Button>
          </Group>
        </Paper>
      ) : null}

      <CrossfadeSwap
        loading={pending}
        minHoldMs={MIN_SKELETON_HOLD_MS}
        mode="overlay"
        skeleton={<KahStatusSkeleton />}
      >
        {!hasContent ? (
          allGroups ? (
            <EmptyState
              icon={<IconUsersGroup size={18} />}
              description="No KAH groups exist yet."
              actionLabel="Manage KAH groups"
              actionHref="/settings/kah-groups"
            />
          ) : (
            <EmptyState
              icon={<IconUsersGroup size={18} />}
              description="You are not part of any KAH group."
            />
          )
        ) : (
          <Stack gap="sm">
            {episodes.length > 0 ? (
              <>
                {/* The result summary line (the Double Booking recipe) — also
                    the announcement a range change was missing: the cards keep
                    `live={false}`, so only this line speaks. */}
                <Text fz="sm" c="dimmed" role="status" aria-live="polite">
                  {episodes.length} breach {episodes.length === 1 ? "period" : "s"} in the next{" "}
                  {kahRangeLabel(rangeMonths)}
                  {statusSummary ? ` — ${statusSummary}` : ""}.
                </Text>
                {episodes.map((episode) => {
                  const awayCount = episode.members.filter((member) => member.away).length;
                  const inCountryCount = episode.members.length - awayCount;
                  return (
                    <ClashCard
                      key={`${episode.groupId}:${episode.startDate}`}
                      heading={`${episode.groupName} — down to ${episode.worstPct}% in country (needs ${episode.requiredPct}%)`}
                      headingSecondary={`${periodLabel(episode)} · ${dayCount(episode.days)}`}
                      live={false}
                      summaryBelow={
                        <Stack gap={6}>
                          <Group gap="xs" align="center">
                            {statusBadge(episode.status)}
                            <Text size="xs" c="dimmed">
                              {awayCount} away · {inCountryCount} in country · worst{" "}
                              {clashDayLabel(episode.worstDate, todayKey)}
                            </Text>
                          </Group>
                          <MemberChips members={episode.members} currentUserId={currentUserId} />
                        </Stack>
                      }
                    >
                      {episode.events.length > 0 ? (
                        episode.events.map((entry, index) => (
                          <ClashEventRow
                            key={`${entry.calendarId}:${entry.googleEventId}:${index}`}
                            entry={entry}
                            typeFirst
                            onOpen={(rect) => void openDetail(entry, rect)}
                          />
                        ))
                      ) : (
                        <Text size="xs" c="dimmed">
                          No overseas events found for this breach.
                        </Text>
                      )}
                    </ClashCard>
                  );
                })}
              </>
            ) : (
              <Box role="status" aria-live="polite">
                <EmptyState
                  icon={<IconCircleCheck size={18} />}
                  description={
                    allGroups
                      ? `No KAH breaches in the next ${kahRangeLabel(rangeMonths)} — every group stays in country.`
                      : `No KAH breaches in the next ${kahRangeLabel(rangeMonths)} — your groups stay in country.`
                  }
                  actionLabel="Open calendar"
                  actionHref="/dashboard"
                />
              </Box>
            )}

            {/* Groups with no breached day: the "is my group OK?" answer. */}
            {allClearGroups.length > 0 ? (
              <Paper withBorder p="sm">
                <Stack gap={6}>
                  <Text component="h3" fz="sm" fw={600} c="dimmed">
                    All clear
                  </Text>
                  {allClearGroups.map((name) => (
                    <Group key={name} gap={6} wrap="nowrap">
                      <IconCircleCheck
                        size={14}
                        color="var(--mantine-color-green-6)"
                        aria-hidden
                        style={{ flexShrink: 0 }}
                      />
                      <Text fz="sm" lineClamp={1}>
                        {name}
                      </Text>
                      <Text fz="sm" c="dimmed" lineClamp={1}>
                        — no breaches in the window
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Paper>
            ) : null}
          </Stack>
        )}
      </CrossfadeSwap>

      {hasContent ? (
        <Text fz="xs" c="dimmed">
          KAH breaches are advisory — they never block event creation. Tap an event to see its
          details.
        </Text>
      ) : null}

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
        isAdmin={allGroups}
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
}
