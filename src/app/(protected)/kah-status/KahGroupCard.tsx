"use client";

import { Badge, Box, Group, Paper, Progress, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconAlertTriangle, IconCircleCheck, IconClockExclamation } from "@tabler/icons-react";

import { groupStateLabel } from "@/lib/kah/display";
import { clashDayLabel } from "@/lib/events/clashDisplay";
import type { KahGroupRow } from "@/lib/kah/range";

import { KahGroupRoster } from "./KahGroupRoster";
import { KahStatusBadge } from "./KahStatusBadge";

const STATE_THEME = {
  active: { color: "red", icon: IconAlertTriangle },
  upcoming: { color: "yellow", icon: IconClockExclamation },
  clear: { color: "green", icon: IconCircleCheck },
} as const;

/**
 * One KAH group: its standing for the scanned window, a single current/minimum
 * percentage badge with the in-country meter, the worst dip so far, and the
 * **full roster** with each member's away calendar. This is the page's primary
 * surface — the breach periods below it only name who was away for each run.
 */
export function KahGroupCard({
  group,
  currentUserId,
  todayKey,
}: {
  group: KahGroupRow;
  currentUserId: string;
  todayKey: string;
}) {
  const state = STATE_THEME[group.state];
  const StateIcon = state.icon;
  const hasMembers = group.totalMembers > 0;
  const belowToday = hasMembers && group.todayPct < group.requiredPct;
  const worstPct = group.worstPct;
  const worstDate = group.worstDate;
  const hasWorst = group.state !== "clear" && worstPct !== null && worstDate !== null;

  return (
    <Paper withBorder radius="md" p="md" className="c2-kah-group" data-state={group.state}>
      <Stack gap="sm">
        <Group gap="sm" align="flex-start" wrap="nowrap">
          <ThemeIcon variant="light" color={state.color} radius="xl" size="md" aria-hidden>
            <StateIcon size={16} />
          </ThemeIcon>
          <Group gap={6} wrap="wrap" style={{ flexGrow: 1, minWidth: 0 }}>
            <Text component="h3" fz="md" fw={600} style={{ overflowWrap: "anywhere" }}>
              {group.name}
            </Text>
            {group.isMember ? (
              <Badge size="xs" variant="light" color="brand">
                Your group
              </Badge>
            ) : null}
            <KahStatusBadge size="xs" color={state.color}>
              {groupStateLabel(group.state)}
            </KahStatusBadge>
          </Group>
        </Group>

        {hasMembers ? (
          <Box>
            <KahStatusBadge
              size="xs"
              color={belowToday ? "red" : "green"}
              aria-label={`In country today: ${group.todayPct}%. Minimum required: ${group.requiredPct}%.`}
            >
              {group.todayPct}% now · needs {group.requiredPct}%
            </KahStatusBadge>
            <Box aria-hidden mt={6}>
              <Progress
                value={group.todayPct}
                color={belowToday ? "red" : "green"}
                size={6}
                radius="xl"
              />
            </Box>
          </Box>
        ) : null}

        {hasWorst ? (
          <Text fz="xs" c="dimmed">
            Worst: {worstPct}% on {clashDayLabel(worstDate, todayKey)}
            {group.state === "upcoming" && group.nextBreachDate
              ? ` · next ${clashDayLabel(group.nextBreachDate, todayKey)}`
              : ""}
          </Text>
        ) : null}

        <KahGroupRoster
          groupName={group.name}
          members={group.members}
          currentUserId={currentUserId}
          todayKey={todayKey}
        />
      </Stack>
    </Paper>
  );
}
