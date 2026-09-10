"use client";

import dayjs from "dayjs";
import { Badge, Group, Paper, Stack, Table, Text } from "@mantine/core";
import { IconCircleCheck, IconUsersGroup } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { useColdStartContent } from "@/components/ColdStartReady";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";

/** One breach period (consecutive breached days) for a group, names pre-resolved. */
export interface KahEpisodeRow {
  groupId: string;
  groupName: string;
  requiredPct: number;
  startDate: string;
  endDate: string;
  days: number;
  worstPct: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  status: "active" | "upcoming" | "resolved";
  awayNames: string[];
}

interface KahStatusViewProps {
  windowStart: string;
  windowEnd: string;
  /** Admin view: shows every KAH group (not just the viewer's memberships). */
  allGroups?: boolean;
  episodes: KahEpisodeRow[];
  /** Groups with no breached day in the window. */
  allClearGroups: string[];
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

function AwayNames({ names, highlight }: { names: string[]; highlight: boolean }) {
  if (names.length === 0) {
    return (
      <Text fz="sm" c="dimmed">
        No one away
      </Text>
    );
  }
  return (
    <Text fz="sm" c={highlight ? "red" : undefined} lineClamp={2}>
      {names.join(", ")}
    </Text>
  );
}

export function KahStatusView({
  windowStart,
  windowEnd,
  allGroups = false,
  episodes,
  allClearGroups,
}: KahStatusViewProps) {
  const windowLabel = `${dayjs(windowStart).format("MMM D, YYYY")} – ${dayjs(windowEnd).format(
    "MMM D, YYYY",
  )}`;
  // Cold-start readiness: this view only mounts after the server computed the
  // whole window, so reporting on mount is exactly "content painted".
  useColdStartContent();

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
        subtitle={`${windowLabel} · KAH breaches across the past & next 3 months${
          counts ? ` · ${counts}` : ""
        }`}
      />

      {allGroups ? (
        <Text fz="sm" c="dimmed">
          Admin view — showing all KAH groups
        </Text>
      ) : null}

      {episodes.length === 0 && allClearGroups.length === 0 ? (
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
            <>
              {/* Mobile: card list */}
              <Stack gap="sm" hiddenFrom="lg">
                {episodes.map((episode) => (
                  <Paper key={`${episode.groupId}:${episode.startDate}`} withBorder p="sm">
                    <Stack gap={6}>
                      <Group justify="space-between" wrap="nowrap">
                        <Text fw={600} lineClamp={1}>
                          {episode.groupName}
                        </Text>
                        {statusBadge(episode.status)}
                      </Group>
                      <Text fz="sm" c="dimmed">
                        {periodLabel(episode)} · {dayCount(episode.days)}
                      </Text>
                      <Text fz="sm" c="dimmed">
                        {episode.worstPct}% of {episode.requiredPct}% in country (lowest)
                      </Text>
                      <AwayNames
                        names={episode.awayNames}
                        highlight={episode.status === "active"}
                      />
                    </Stack>
                  </Paper>
                ))}
              </Stack>

              {/* Desktop: data table */}
              <Paper withBorder visibleFrom="lg">
                <Table withRowBorders={false} highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Group</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Period</Table.Th>
                      <Table.Th>Lowest in country</Table.Th>
                      <Table.Th>Away</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {episodes.map((episode) => (
                      <Table.Tr key={`${episode.groupId}:${episode.startDate}`}>
                        <Table.Td>
                          <Text fw={600}>{episode.groupName}</Text>
                        </Table.Td>
                        <Table.Td>{statusBadge(episode.status)}</Table.Td>
                        <Table.Td>
                          <Text fz="sm">{periodLabel(episode)}</Text>
                          <Text fz="xs" c="dimmed">
                            {dayCount(episode.days)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text fz="sm">
                            {episode.worstPct}% of {episode.requiredPct}%
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <AwayNames
                            names={episode.awayNames}
                            highlight={episode.status === "active"}
                          />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
            </>
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
    </Stack>
  );
}
