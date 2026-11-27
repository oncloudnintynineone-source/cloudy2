import { addDays, shiftMonth } from "@/lib/events/datetime";
import type { DashboardViewKind } from "@/lib/dashboardViews/views";

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
  if (anchor.kind === "week" || anchor.kind === "weekv2" || anchor.kind === "weekgrid") {
    const date = addDays(anchor.date, dir * 7);
    return { month: date.slice(0, 7), date };
  }
  const date = addDays(anchor.date, dir);
  return { month: date.slice(0, 7), date };
}
