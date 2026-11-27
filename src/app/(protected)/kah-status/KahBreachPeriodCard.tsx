"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";

import { ClashCard, ClashEventRow } from "@/components/clashCards";
import { clashDayLabel } from "@/lib/events/clashDisplay";
import type { EventClashEntry } from "@/lib/events/clashActions";
import type { Rect } from "@/lib/motion/origin";
import { capBadgeItems } from "@/lib/ui/badgeCap";
import { periodLabel } from "@/lib/kah/display";
import type { KahEpisodeRow, KahMemberRef } from "@/lib/kah/range";

import { KahStatusBadge } from "./KahStatusBadge";

function episodeStatusBadge(status: KahEpisodeRow["status"]) {
  if (status === "active") {
    return (
      <KahStatusBadge size="sm" color="red">
        Active
      </KahStatusBadge>
    );
  }
  if (status === "upcoming") {
    return (
      <KahStatusBadge size="sm" color="yellow">
        Upcoming
      </KahStatusBadge>
    );
  }
  return (
    <KahStatusBadge size="sm" color="green">
      Resolved
    </KahStatusBadge>
  );
}

/** The one-line chip text; ellipsized (the full roster above always shows names in full). */
function chipText(label: string) {
  return (
    <span
      style={{
        display: "block",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

/**
 * The away members of one breach run as chips, capped through the shared
 * `capBadgeItems` recipe so the viewer's own chip is pinned first and can never
 * be hidden behind the cap. The group's full roster lives on its card above.
 */
function AwayMemberChips({
  members,
  currentUserId,
}: {
  members: KahMemberRef[];
  currentUserId: string;
}) {
  const { visible, overflow } = capBadgeItems(
    members,
    12,
    (member) => member.userId === currentUserId,
  );
  return (
    <Group gap={4} wrap="wrap">
      {visible.map((member) => {
        const isYou = member.userId === currentUserId;
        const label = isYou ? `${member.name} (You)` : member.name;
        const title = isYou
          ? `${member.name} (you) — away at some point during this period`
          : "Away at some point during this period";
        return isYou ? (
          <Badge
            key={member.userId}
            size="xs"
            variant="filled"
            color="brand"
            maw="100%"
            title={title}
          >
            {chipText(label)}
          </Badge>
        ) : (
          <KahStatusBadge key={member.userId} size="xs" color="red" maw="100%" title={title}>
            {chipText(label)}
          </KahStatusBadge>
        );
      })}
      {overflow > 0 ? (
        <Text size="xs" c="dimmed">
          +{overflow} more
        </Text>
      ) : null}
    </Group>
  );
}

/**
 * One breach period: the shared collapsible clash card, with the period, its
 * worst dip, who was away across the run, and the overseas events that took
 * them away (each opening the in-place read-only detail).
 */
export function KahBreachPeriodCard({
  episode,
  currentUserId,
  todayKey,
  onOpen,
}: {
  episode: KahEpisodeRow;
  currentUserId: string;
  todayKey: string;
  onOpen: (entry: EventClashEntry, rect: Rect) => void;
}) {
  const awayCount = episode.awayIds.length;
  const inCountryCount = Math.max(0, episode.totalMembers - awayCount);

  return (
    <ClashCard
      heading={`${episode.groupName} — down to ${episode.worstPct}% in country (needs ${episode.requiredPct}%)`}
      headingSecondary={`${periodLabel(episode)} · ${episode.days} day${episode.days === 1 ? "" : "s"}`}
      live={false}
      summaryBelow={
        <Stack gap={6}>
          <Group gap="xs" align="center" wrap="wrap">
            {episodeStatusBadge(episode.status)}
            <Text size="xs" c="dimmed">
              {awayCount} away · {inCountryCount} in country · worst{" "}
              {clashDayLabel(episode.worstDate, todayKey)}
            </Text>
          </Group>
          {episode.awayMembers.length > 0 ? (
            <AwayMemberChips members={episode.awayMembers} currentUserId={currentUserId} />
          ) : null}
        </Stack>
      }
    >
      {episode.events.length > 0 ? (
        episode.events.map((entry, index) => (
          <ClashEventRow
            key={`${entry.calendarId}:${entry.googleEventId}:${index}`}
            entry={entry}
            typeFirst
            onOpen={(rect) => onOpen(entry, rect)}
          />
        ))
      ) : (
        <Text size="xs" c="dimmed">
          No overseas events found for this breach.
        </Text>
      )}
    </ClashCard>
  );
}
