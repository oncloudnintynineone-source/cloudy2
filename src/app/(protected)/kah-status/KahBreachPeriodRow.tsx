"use client";

import { useId, useState } from "react";
import { Badge, Collapse, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";

import { useMotion } from "@/components/MotionProvider";
import { ClashEventRow } from "@/components/clashCards";
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

/** The one-line chip text; ellipsized (the roster above always shows names in full). */
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
 * be hidden behind the cap. The full roster lives on the group card above.
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
 * One breach period inside its group card: a flat disclosure row (no nested
 * amber clash card) with the period, its worst dip and who was away visible,
 * and the overseas events behind it revealed on expand (each opening the
 * in-place read-only detail). The month timeline above can focus a row.
 */
export function KahBreachPeriodRow({
  episode,
  id,
  currentUserId,
  todayKey,
  onOpen,
}: {
  episode: KahEpisodeRow;
  /** Stable DOM id so the month strip can focus this row. */
  id: string;
  currentUserId: string;
  todayKey: string;
  onOpen: (entry: EventClashEntry, rect: Rect) => void;
}) {
  const motion = useMotion();
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const awayCount = episode.awayIds.length;
  const inCountryCount = Math.max(0, episode.totalMembers - awayCount);
  const days = `${episode.days} day${episode.days === 1 ? "" : "s"}`;

  return (
    <div className="c2-kah-period">
      <UnstyledButton
        id={id}
        type="button"
        className="c2-kah-period-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={regionId}
      >
        <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
          <Stack gap={2} style={{ minWidth: 0, flexGrow: 1 }}>
            <Group gap={6} align="center" wrap="wrap">
              {episodeStatusBadge(episode.status)}
              <Text fz="sm" fw={500} style={{ overflowWrap: "anywhere" }}>
                {periodLabel(episode)}
              </Text>
              <Text fz="xs" c="dimmed">
                · {days} · down to {episode.worstPct}%
              </Text>
            </Group>
            <Text fz="xs" c="dimmed">
              {awayCount} away · {inCountryCount} in country · worst{" "}
              {clashDayLabel(episode.worstDate, todayKey)}
            </Text>
          </Stack>
          <IconChevronDown
            size={16}
            style={{
              flexShrink: 0,
              marginTop: 2,
              transform: open ? "rotate(180deg)" : undefined,
              transition: `transform ${motion.duration.micro}ms ${motion.easing.out}`,
            }}
            aria-hidden
          />
        </Group>
      </UnstyledButton>

      <Stack gap={6} className="c2-kah-period-body">
        {episode.awayMembers.length > 0 ? (
          <AwayMemberChips members={episode.awayMembers} currentUserId={currentUserId} />
        ) : null}
        <Collapse
          expanded={open}
          id={regionId}
          transitionDuration={motion.duration.popover}
          transitionTimingFunction={motion.easing.out}
        >
          <Stack gap="sm" pt="xs">
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
          </Stack>
        </Collapse>
      </Stack>
    </div>
  );
}
