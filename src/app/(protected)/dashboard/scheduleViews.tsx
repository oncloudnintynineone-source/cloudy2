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
 * globally on every route.
 *
 * No refs are forwarded: the dashboard consumes each view as plain JSX and
 * measures surrounding wrapper elements, never the view instances themselves.
 */

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

import "@mantine/schedule/styles.css";

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
