"use client";

import { Box, Stack, Text } from "@mantine/core";

import { ClashMonthStrip } from "@/components/clashTimeline";
import { buildClashMonthStrip } from "@/lib/events/clashDisplay";
import type { EventClashEntry } from "@/lib/events/clashActions";
import type { Rect } from "@/lib/motion/origin";
import type { KahGroupRow } from "@/lib/kah/range";

import { KahBreachPeriodRow } from "./KahBreachPeriodRow";

/** Stable DOM id for a period row; the month strip focuses it on jump. */
function periodDomId(groupId: string, startDate: string): string {
  return `kah-period-${groupId}-${startDate}`;
}

/**
 * A group's breach section, rendered inside its own card: a month preview strip
 * over the selected window (the shared `ClashMonthStrip`, busy cells = breach
 * days) and one flat disclosure row per breach period. Tapping a busy month
 * scrolls to and focuses the period row containing that month's first breach
 * day. The group card owns the roster above; this section owns the forecast.
 */
export function KahGroupBreaches({
  group,
  windowStart,
  windowEnd,
  rangeLabel,
  todayKey,
  currentUserId,
  onOpen,
}: {
  group: KahGroupRow;
  windowStart: string;
  windowEnd: string;
  /** e.g. "6 months" — used in the strip's accessible name. */
  rangeLabel: string;
  todayKey: string;
  currentUserId: string;
  onOpen: (entry: EventClashEntry, rect: Rect) => void;
}) {
  if (group.episodes.length === 0) {
    return null;
  }

  const cells = buildClashMonthStrip(windowStart, windowEnd, group.breachDayKeys, todayKey);

  function focusPeriod(dayKey: string) {
    const episode =
      group.episodes.find(
        (candidate) => candidate.startDate <= dayKey && dayKey <= candidate.endDate,
      ) ?? group.episodes.find((candidate) => candidate.startDate >= dayKey);
    if (!episode) {
      return;
    }
    const target = document.getElementById(periodDomId(group.groupId, episode.startDate));
    if (!target) {
      return;
    }
    // Match Double Booking's jump: reduced motion gets an instant scroll, and
    // the row takes focus so keyboard/screen-reader users land on it.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
    target.focus({ preventScroll: true });
  }

  return (
    <Box className="c2-kah-breaches">
      <Stack gap="xs">
        {/* The heading only: the rows below count themselves, and the month strip
            already shows how much of the window is affected — a "2 periods" pill
            beside it restated both. */}
        <Text component="h4" fz="xs" fw={600} c="dimmed">
          Breaches
        </Text>
        <ClashMonthStrip
          cells={cells}
          rangeLabel={rangeLabel}
          onJump={focusPeriod}
          label={`Breach days for ${group.name} over the next ${rangeLabel}`}
          unit={{ one: "breach day", other: "breach days" }}
          className="c2-kah-timeline"
        />
        <Stack gap={0} className="c2-kah-periods">
          {group.episodes.map((episode) => (
            <KahBreachPeriodRow
              key={episode.startDate}
              id={periodDomId(group.groupId, episode.startDate)}
              episode={episode}
              currentUserId={currentUserId}
              onOpen={onOpen}
            />
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}
