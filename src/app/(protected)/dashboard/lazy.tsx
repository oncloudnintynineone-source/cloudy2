"use client";

import dynamic from "next/dynamic";
import { Skeleton, Stack } from "@mantine/core";

/**
 * Lazy modules for the dashboard. Everything here is statically importable but
 * not part of the first-paint critical path: the five calendar views (only one
 * renders at a time) and the modals (none renders until opened). Splitting
 * them out keeps the @mantine/schedule + @mantine/dates vendor code out of the
 * initial bundle — a cold start only pays for the active view's chunk, and the
 * rest lands in the idle preload below before the user needs it.
 *
 * Note: @mantine/schedule ships a single barrel entry (no per-component
 * exports), so all of its views share one lazy chunk. That chunk still leaves
 * the critical path: the SSR HTML paints the active view immediately while its
 * chunk downloads in parallel with hydration.
 */

function chunkLoading() {
  // Shown inside an already-open modal (or the grid area) while its chunk
  // loads — a few skeleton rows read as content assembling, never a blank.
  return (
    <Stack gap="sm" py="sm">
      <Skeleton height={16} width="60%" />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={32} />
    </Stack>
  );
}

/**
 * Loader registry. `dynamic()` below consumes the same functions, and the
 * preload helpers call them directly — the bundler caches the module promise
 * per specifier, so preloading and rendering can never diverge.
 */
const loaders = {
  monthView: () => import("@mantine/schedule").then((m) => m.MonthView),
  resourcesWeekView: () => import("@mantine/schedule").then((m) => m.ResourcesWeekView),
  resourcesDayView: () => import("@mantine/schedule").then((m) => m.ResourcesDayView),
  agendaView: () => import("@mantine/schedule").then((m) => m.AgendaView),
  weekMatrixView: () => import("./WeekMatrixView").then((m) => m.WeekMatrixView),
  eventForm: () => import("./EventForm").then((m) => m.EventForm),
  eventDetail: () => import("./EventDetail").then((m) => m.EventDetail),
  filterModal: () => import("@/components/FilterModal").then((m) => m.FilterModal),
  dateSelectorModal: () => import("@/components/DateSelectorModal").then((m) => m.DateSelectorModal),
};

export const MonthViewLazy = dynamic(loaders.monthView, { loading: chunkLoading });
export const ResourcesWeekViewLazy = dynamic(loaders.resourcesWeekView, {
  loading: chunkLoading,
});
export const ResourcesDayViewLazy = dynamic(loaders.resourcesDayView, {
  loading: chunkLoading,
});
export const AgendaViewLazy = dynamic(loaders.agendaView, { loading: chunkLoading });
export const WeekMatrixViewLazy = dynamic(loaders.weekMatrixView, { loading: chunkLoading });
export const EventFormLazy = dynamic(loaders.eventForm, { loading: chunkLoading });
export const EventDetailLazy = dynamic(loaders.eventDetail, { loading: chunkLoading });
export const FilterModalLazy = dynamic(loaders.filterModal, { loading: chunkLoading });
export const DateSelectorModalLazy = dynamic(loaders.dateSelectorModal, {
  loading: chunkLoading,
});

const VIEW_TO_LOADER: Record<"month" | "week" | "weekv2" | "schedule" | "agenda", keyof typeof loaders> =
  {
    month: "monthView",
    week: "resourcesWeekView",
    weekv2: "weekMatrixView",
    schedule: "resourcesDayView",
    agenda: "agendaView",
  };

/**
 * Kick off the active view's chunk as early as render allows. On the server
 * the module is already required for the SSR pass, so this is a no-op there;
 * on the client it overlaps the download with hydration work so a cold start
 * rarely waits on it. Idempotent (module promise is cached).
 */
export function ensureActiveView(
  view: "month" | "week" | "weekv2" | "schedule" | "agenda",
): void {
  loaders[VIEW_TO_LOADER[view]]().catch(() => {});
}

/** Warm every lazy module; called once from `requestIdleCallback` after first paint. */
export function preloadDashboardModules(): void {
  for (const load of Object.values(loaders)) {
    load().catch(() => {});
  }
}
