"use client";

import { useRef, useState, useTransition } from "react";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCircleCheck, IconUsersGroup } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { NoKeyboardSelect } from "@/components/NoKeyboardSelect";
import { PageHeader } from "@/components/PageHeader";
import { useColdStartContent } from "@/components/ColdStartReady";
import { ClashCard, ClashEventRow } from "@/components/clashCards";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { useMinSkeletonHold } from "@/lib/loading/minHoldLoading";
import type { Rect } from "@/lib/motion/origin";
import type { EventClashEntry } from "@/lib/events/clashActions";
import { buildEventDeepLink } from "@/lib/events/deepLink";
import type { CalendarEvent } from "@/lib/events/queries";
import {
  KAH_RANGE_MONTHS,
  kahRangeLabel,
  parseKahRange,
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

/** "Aug 12 – Aug 16" (year shown when the run crosses one); clipped edges show "…". */
function periodLabel(episode: KahEpisodeRow): string {
  const crossesYear = dayjs(episode.startDate).year() !== dayjs(episode.endDate).year();
  const fmt = (date: string) => dayjs(date).format(crossesYear ? "MMM D, YYYY" : "MMM D");
  const start = episode.clippedStart ? "…" : fmt(episode.startDate);
  const end = episode.clippedEnd ? "…" : fmt(episode.endDate);
  return `${start} – ${end}`;
}

function dayCount(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * The group roster as badges: away members in red, in-country members muted, and
 * the signed-in user emphasised (accent). Capped with a `+N more` overflow so a
 * large group stays readable.
 */
function MemberChips({ members, currentUserId }: { members: KahMember[]; currentUserId: string }) {
  const max = 14;
  const ordered = [...members.filter((member) => member.away), ...members.filter((m) => !m.away)];
  const visible = ordered.slice(0, max);
  const rest = ordered.length - visible.length;
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
          >
            {isYou ? `${member.name} (You)` : member.name}
          </Badge>
        );
      })}
      {rest > 0 && (
        <Text size="xs" c="dimmed">
          +{rest} more
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
  const [pending, startTransition] = useTransition();
  const { windowStart, windowEnd, allGroups, episodes, allClearGroups } = data;

  const windowLabel = `${dayjs(windowStart).format("MMM D, YYYY")} – ${dayjs(windowEnd).format(
    "MMM D, YYYY",
  )}`;
  // Cold-start readiness: this view only mounts after the server computed the
  // whole window, so reporting on mount is exactly "content painted".
  useColdStartContent();

  function handleRangeChange(value: string | null) {
    const next = parseKahRange(value);
    if (next === rangeMonths) {
      return;
    }
    setRangeMonths(next);
    startTransition(async () => {
      const result = await getKahStatusView({ rangeMonths: next });
      if (result.ok) {
        setData(result.data);
      } else {
        setRangeMonths(data.rangeMonths);
        notifications.show({ color: "red", message: result.error });
      }
    });
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

  const counts = (["active", "upcoming", "resolved"] as const)
    .map((status) => {
      const count = episodes.filter((episode) => episode.status === status).length;
      return count > 0 ? `${count} ${status}` : null;
    })
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <Stack gap="md" pb="xl" className={CONTENT_ENTER_CLASS}>
      <PageHeader
        title="KAH Status"
        subtitle={`${windowLabel} · KAH breaches over the next ${kahRangeLabel(rangeMonths)}${
          counts ? ` · ${counts}` : ""
        }`}
      />

      <NoKeyboardSelect
        label="Look ahead"
        size="xs"
        w={150}
        allowDeselect={false}
        disabled={pending}
        value={String(rangeMonths)}
        onChange={handleRangeChange}
        data={KAH_RANGE_MONTHS.map((months) => ({
          value: String(months),
          label: kahRangeLabel(months),
        }))}
      />

      {allGroups ? (
        <Text fz="sm" c="dimmed">
          Admin view — showing all KAH groups
        </Text>
      ) : null}

      {pending ? (
        <KahStatusSkeleton />
      ) : episodes.length === 0 && allClearGroups.length === 0 ? (
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
        <>
          {episodes.length > 0 ? (
            <Stack gap="sm">
              {episodes.map((episode) => {
                const awayCount = episode.members.filter((member) => member.away).length;
                const inCountryCount = episode.members.length - awayCount;
                return (
                  <ClashCard
                    key={`${episode.groupId}:${episode.startDate}`}
                    heading={`${episode.groupName} — ${episode.worstPct}% of ${episode.requiredPct}%`}
                    headingSecondary={`${periodLabel(episode)} · ${dayCount(episode.days)}`}
                    live={false}
                    summaryBelow={
                      <Stack gap={6}>
                        <Group gap="xs" align="center">
                          {statusBadge(episode.status)}
                          <Text size="xs" c="dimmed">
                            {awayCount} away · {inCountryCount} in country
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
            </Stack>
          ) : (
            <Text c="dimmed" ta="center" py="sm">
              No KAH breaches in the window.
            </Text>
          )}

          {/* Groups with no breached day: the "is my group OK?" answer. */}
          {allClearGroups.length > 0 ? (
            <Paper withBorder p="sm">
              <Stack gap={6}>
                <Text fz="sm" fw={600} c="dimmed">
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
        </>
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
