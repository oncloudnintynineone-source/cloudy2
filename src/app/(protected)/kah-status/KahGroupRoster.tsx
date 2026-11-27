"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import { IconCircleCheck, IconPlaneDeparture } from "@tabler/icons-react";

import { awaySpanSummary } from "@/lib/kah/display";
import type { KahGroupMemberRow } from "@/lib/kah/range";

import { KahStatusBadge } from "./KahStatusBadge";

/**
 * A group card's full active roster: every member with today's away/in-country
 * reading and their nearest away stretch. Rows are non-interactive, so they
 * carry no tap affordance; the status is always spelled out in text (the icons
 * are decorative), never colour-only.
 */
export function KahGroupRoster({
  groupName,
  members,
  currentUserId,
  todayKey,
}: {
  groupName: string;
  members: KahGroupMemberRow[];
  currentUserId: string;
  todayKey: string;
}) {
  if (members.length === 0) {
    return (
      <Text fz="xs" c="dimmed">
        No active members
      </Text>
    );
  }

  return (
    <Stack component="ul" gap={0} className="c2-kah-roster" aria-label={`${groupName} members`}>
      {members.map((member) => {
        const isYou = member.userId === currentUserId;
        const summary = awaySpanSummary(member.spans, todayKey);
        return (
          <Group
            component="li"
            key={member.userId}
            className="c2-kah-member"
            gap="xs"
            wrap="wrap"
            justify="space-between"
            align="flex-start"
          >
            <div className="c2-kah-member-main">
              <Group gap={6} wrap="wrap">
                <Text fz="sm" fw={isYou ? 600 : 500} style={{ overflowWrap: "anywhere" }}>
                  {member.name}
                </Text>
                {isYou ? (
                  <Badge size="xs" variant="filled" color="brand">
                    You
                  </Badge>
                ) : null}
              </Group>
              {summary ? (
                <Text fz="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
                  {summary.label}
                  {summary.more > 0
                    ? ` · +${summary.more} more trip${summary.more === 1 ? "" : "s"}`
                    : ""}
                </Text>
              ) : null}
            </div>
            {member.awayToday ? (
              <KahStatusBadge
                size="xs"
                color="red"
                leftSection={<IconPlaneDeparture size={11} aria-hidden />}
              >
                Away now
              </KahStatusBadge>
            ) : (
              <Badge
                size="xs"
                variant="default"
                leftSection={<IconCircleCheck size={11} aria-hidden />}
              >
                In country
              </Badge>
            )}
          </Group>
        );
      })}
    </Stack>
  );
}
