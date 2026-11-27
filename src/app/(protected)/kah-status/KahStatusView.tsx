"use client";

import { useState, useTransition } from "react";
import dayjs from "dayjs";
import { Box, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { IconCircleCheck, IconRefresh, IconUsersGroup } from "@tabler/icons-react";

import { CrossfadeSwap } from "@/components/CrossfadeSwap";
import { EmptyState } from "@/components/EmptyState";
import { useColdStartContent } from "@/components/ColdStartReady";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { MIN_SKELETON_HOLD_MS } from "@/lib/loading/minHoldLoading";
import { formatInstantToNaive } from "@/lib/events/datetime";
import { kahRangeLabel, type KahRangeMonths, type KahStatusViewData } from "@/lib/kah/range";
import { getKahStatusView } from "@/lib/kah/statusActions";

import { KahEventDetailModal } from "./KahEventDetailModal";
import { KahGroupCard } from "./KahGroupCard";
import { KahStatusHead } from "./KahStatusHead";
import { KahStatusSkeleton } from "./KahStatusSkeleton";
import { useKahEventDetail } from "./useKahEventDetail";

interface KahStatusViewProps {
  initial: KahStatusViewData;
  /** Id of the signed-in user, emphasised in the rosters and away chips. */
  currentUserId: string;
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/**
 * The KAH Status page: every KAH group (the viewer's own groups marked) with its
 * current status, its own breach preview + period rows, and its full roster and
 * away calendar, over the selected forward look-ahead (6 months by default, or
 * 1 year). Read-only and advisory — see docs/kah.md §1.7.
 */
export function KahStatusView({ initial, currentUserId }: KahStatusViewProps) {
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
  const { windowStart, windowEnd, isAdmin, groups } = data;
  // The page summary is derived from the groups; each card renders its own
  // breach preview + period rows (no separate page-level breach section).
  const episodes = groups.flatMap((group) => group.episodes);
  const detail = useKahEventDetail();

  const windowLabel = `${dayjs(windowStart).format("MMM D, YYYY")} – ${dayjs(windowEnd).format(
    "MMM D, YYYY",
  )}`;
  // Civil "today" for the worst-day / away-span labels (Today / Tomorrow / Sep 14).
  const todayKey = formatInstantToNaive(new Date()).slice(0, 10);
  const breachingGroups = groups.filter((group) => group.state !== "clear").length;
  const statusSummary = (["active", "upcoming", "resolved"] as const)
    .map((status) => {
      const count = episodes.filter((episode) => episode.status === status).length;
      return count > 0 ? `${count} ${status}` : null;
    })
    .filter((part): part is string => part !== null)
    .join(", ");
  const rangeLabel = kahRangeLabel(rangeMonths);
  const summary =
    episodes.length > 0
      ? `${plural(episodes.length, "breach period")} across ${plural(
          breachingGroups,
          "group",
        )} in the next ${rangeLabel}${statusSummary ? ` — ${statusSummary}` : ""}.`
      : `No KAH breaches in the next ${rangeLabel} — all ${plural(
          groups.length,
          "group",
        )} stay in country.`;
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

  return (
    <Stack gap="md" pb="xl" className={CONTENT_ENTER_CLASS}>
      <KahStatusHead
        windowLabel={windowLabel}
        rangeMonths={rangeMonths}
        onRangeChange={handleRangeChange}
        disabled={pending}
      />

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
        {groups.length === 0 ? (
          isAdmin ? (
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
          <Stack gap="lg">
            {/* The result summary — also the live announcement a range change
                makes (the in-card period rows are not live regions). */}
            <Group gap={8} align="flex-start" wrap="nowrap" role="status" aria-live="polite">
              {episodes.length === 0 ? (
                <IconCircleCheck
                  size={16}
                  color="var(--mantine-color-green-6)"
                  aria-hidden
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
              ) : null}
              <Text fz="sm" c="dimmed">
                {summary}
              </Text>
            </Group>

            <Stack gap="sm">
              <Text component="h2" fz="sm" fw={600} c="dimmed">
                Groups
              </Text>
              <Box className="c2-kah-groups">
                {groups.map((group) => (
                  <KahGroupCard
                    key={group.groupId}
                    group={group}
                    currentUserId={currentUserId}
                    todayKey={todayKey}
                    windowStart={windowStart}
                    windowEnd={windowEnd}
                    rangeLabel={rangeLabel}
                    onOpen={(entry, rect) => void detail.openDetail(entry, rect)}
                  />
                ))}
              </Box>
            </Stack>
          </Stack>
        )}
      </CrossfadeSwap>

      <KahEventDetailModal controller={detail} currentUserId={currentUserId} isAdmin={isAdmin} />
    </Stack>
  );
}
