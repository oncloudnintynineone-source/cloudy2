import { cookies } from "next/headers";

import { Box, Group, Skeleton, Stack } from "@mantine/core";

// Straight from the source module: calendarSkeleton.tsx is "use client", so
// its re-export of monthGridRows is a client reference that throws if called
// during this server-side fallback render (rendering its components is fine).
import { monthGridRows } from "@/lib/events/datetime";
import { UI_STATE_COOKIE, decodeUiState, resolveDashboardView } from "@/lib/ui/uiState";
import {
  AgendaListSkeleton,
  MonthGridSkeleton,
  ScheduleGridSkeleton,
  WeekGridSkeleton,
  WeekMatrixSkeleton,
} from "./calendarSkeleton";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Route-level fallback shaped like the view being loaded: the `cloudy2.ui`
 * cookie is read here (with the same validation page.tsx applies) so a cold
 * start onto a remembered Agenda/Week/Day view paints its skeleton instead of
 * a month grid that would hard-swap away. Loading files receive no URL props,
 * so an explicit `?view=` param or an `edit` deep link can briefly disagree
 * with a divergent remembered view — the real render replaces it either way.
 */
export default async function DashboardLoading() {
  const ui = decodeUiState((await cookies()).get(UI_STATE_COOKIE)?.value)?.dashboard;
  const view = resolveDashboardView(ui?.view);
  const month =
    typeof ui?.month === "string" && MONTH_PATTERN.test(ui.month) ? ui.month : currentMonth();

  return (
    <Stack pb="xl" gap="sm">
      {/* Sticky view-tabs bar placeholder (five tabs, flex:1 each). */}
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          paddingBottom: 10,
          borderBottom: "1px solid var(--mantine-color-default-border)",
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            height={28}
            radius={6}
            width={i % 2 === 1 ? "60%" : "45%"}
            style={{ margin: "0 auto" }}
          />
        ))}
      </Box>

      {/* Nav row: chevrons + menu are rounded-square ActionIcons (radius md),
          plus the desktop-only "New event" button between them. */}
      <Group align="center" gap="xs" wrap="nowrap">
        <Skeleton width={43} height={43} radius="md" />
        <Skeleton height={24} style={{ flex: 1 }} />
        <Skeleton width={43} height={43} radius="md" />
        <Skeleton width={104} height={43} radius="md" visibleFrom="lg" />
        <Skeleton width={43} height={43} radius="md" />
      </Group>

      {view === "month" ? (
        <MonthGridSkeleton rows={monthGridRows(month)} />
      ) : view === "weekv2" ? (
        <WeekMatrixSkeleton />
      ) : view === "week" ? (
        <WeekGridSkeleton />
      ) : view === "agenda" ? (
        <AgendaListSkeleton />
      ) : (
        <ScheduleGridSkeleton />
      )}
    </Stack>
  );
}
