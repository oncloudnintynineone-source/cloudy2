import { addDays, lastDayOfMonth, shiftMonth } from "@/lib/events/datetime";
import type { DashboardViewKind } from "@/lib/dashboardViews/views";

export interface DashboardPrefetchTarget {
  view: string;
  month: string;
  date: string | null;
}

export interface DashboardPeriodAnchor {
  kind: DashboardViewKind;
  month: string;
  date: string;
}

export function dashboardBootSignature(input: {
  view: string | null;
  month: string | null;
  date: string | null;
  refresh: string | null;
}): string {
  return JSON.stringify([input.view, input.month, input.date, input.refresh]);
}

export function prefetchTargetForPeriod(
  anchor: DashboardPeriodAnchor,
  dir: -1 | 1,
): { month: string; date: string | null } {
  if (anchor.kind === "month") {
    return { month: shiftMonth(anchor.month, dir), date: null };
  }
  if (anchor.kind === "dual") {
    const nextMonth = shiftMonth(anchor.date.slice(0, 7), dir);
    const day = Number(anchor.date.slice(8, 10));
    const lastDay = Number(lastDayOfMonth(nextMonth).slice(8, 10));
    return {
      month: nextMonth,
      date: `${nextMonth}-${String(Math.min(day, lastDay)).padStart(2, "0")}`,
    };
  }
  if (anchor.kind === "week" || anchor.kind === "weekv2" || anchor.kind === "weekgrid") {
    const date = addDays(anchor.date, dir * 7);
    return { month: date.slice(0, 7), date };
  }
  const date = addDays(anchor.date, dir);
  return { month: date.slice(0, 7), date };
}

export function prefetchTargetForTab(
  tab: { id: string },
  updates: Record<string, string | null>,
  current: { month: string; date: string },
): DashboardPrefetchTarget {
  const updateMonth = typeof updates.month === "string" ? updates.month : null;
  const updateDate = typeof updates.date === "string" ? updates.date : null;
  const date = updateDate ?? (updates.date === null ? null : current.date);
  const month = updateMonth ?? (date ? date.slice(0, 7) : current.month);
  return { view: tab.id, month, date };
}
