"use client";

/**
 * Lazy wrappers around the `@mantine/schedule` view components.
 *
 * `@mantine/schedule` is the heaviest client dependency in the app (~206 KB
 * uncompressed) and every one of its views is used by exactly one dashboard
 * view kind. Importing the package directly at the top of `DashboardView`
 * therefore put all of it in the dashboard's initial chunk. These wrappers are
 * `next/dynamic` (client-only) so the package is only fetched when a view that
 * actually needs it renders — the schedule CSS ships with it too, instead of
 * globally on every route. `preloadScheduleViewKinds` warms only the kinds the
 * account has tabs for, never the whole set.
 *
 * No refs are forwarded: the dashboard consumes each view as plain JSX and
 * measures surrounding wrapper elements, never the view instances themselves.
 */

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

import "@mantine/schedule/styles.css";

import type { DashboardViewKind } from "@/lib/dashboardViews/views";
import { AgendaListSkeleton, MonthGridSkeleton, ScheduleGridSkeleton } from "./calendarSkeleton";

type ScheduleModule = typeof import("@mantine/schedule");

type MonthViewProps = ComponentProps<ScheduleModule["MonthView"]>;
type WeekViewProps = ComponentProps<ScheduleModule["WeekView"]>;
type AgendaViewProps = ComponentProps<ScheduleModule["AgendaView"]>;
type ResourcesWeekViewProps = ComponentProps<ScheduleModule["ResourcesWeekView"]>;
type ResourcesDayViewProps = ComponentProps<ScheduleModule["ResourcesDayView"]>;
type MoreEventsProps = ComponentProps<ScheduleModule["MoreEvents"]>;

export const LazyMonthView = dynamic<MonthViewProps>(
  () => import("@mantine/schedule").then((mod) => ({ default: mod.MonthView })),
  { ssr: false, loading: () => <MonthGridSkeleton rows={6} /> },
);

export const LazyWeekView = dynamic<WeekViewProps>(
  () => import("@mantine/schedule").then((mod) => ({ default: mod.WeekView })),
  { ssr: false, loading: () => <ScheduleGridSkeleton /> },
);

export const LazyAgendaView = dynamic<AgendaViewProps>(
  () => import("@mantine/schedule").then((mod) => ({ default: mod.AgendaView })),
  { ssr: false, loading: () => <AgendaListSkeleton /> },
);

export const LazyResourcesWeekView = dynamic<ResourcesWeekViewProps>(
  () => import("@mantine/schedule").then((mod) => ({ default: mod.ResourcesWeekView })),
  { ssr: false, loading: () => <ScheduleGridSkeleton /> },
);

export const LazyResourcesDayView = dynamic<ResourcesDayViewProps>(
  () => import("@mantine/schedule").then((mod) => ({ default: mod.ResourcesDayView })),
  { ssr: false, loading: () => <ScheduleGridSkeleton /> },
);

export const LazyMoreEvents = dynamic<MoreEventsProps>(
  () => import("@mantine/schedule").then((mod) => ({ default: mod.MoreEvents })),
  { ssr: false },
);

/** The renderer chunks each schedule-backed view kind needs. */
const SCHEDULE_PRELOADERS: Partial<Record<DashboardViewKind, readonly unknown[]>> = {
  month: [LazyMonthView],
  week: [LazyResourcesWeekView],
  schedule: [LazyResourcesDayView],
  agenda: [LazyAgendaView],
  weekgrid: [LazyWeekView, LazyMoreEvents],
  // `dual` and `weekv2` are custom grids, warmed from DashboardView.
};

/**
 * Fetch the schedule chunks for the given view kinds only. The active view is
 * already loaded by first render; this lets the dashboard warm the kinds the
 * account actually has tabs for instead of every schedule view. Best-effort
 * and idempotent; the caller applies the connection gate.
 *
 * Resolves once every requested kind's chunks have settled, so
 * `DashboardView` can hold its in-page skeleton until the real renderer (not
 * `next/dynamic`'s fallback) can mount.
 */
export function preloadScheduleViewKinds(kinds: readonly DashboardViewKind[]): Promise<void> {
  const seen = new Set<unknown>();
  const pending: Promise<unknown>[] = [];
  for (const kind of kinds) {
    for (const component of SCHEDULE_PRELOADERS[kind] ?? []) {
      if (seen.has(component)) {
        continue;
      }
      seen.add(component);
      const preload = (component as { preload?: () => Promise<unknown> }).preload;
      if (!preload) {
        continue;
      }
      pending.push(preload.call(component).catch(() => {}));
    }
  }
  return Promise.all(pending).then(() => undefined);
}
