/**
 * Pure warm-plan helpers for the dashboard.
 *
 * The dashboard may only carry code for the view kinds the account actually
 * has tabs for. `tabWarmKinds` deduplicates them in strip order so the idle
 * effect has a stable, minimal target set (and a stable effect signature).
 */

import type { DashboardViewKind, DashboardViewTab } from "@/lib/dashboardViews/views";

/** How long the wizard waits after the active view before warming at idle. */
export const WIZARD_WARM_DELAY_MS = 5_000;

export function tabWarmKinds(tabs: readonly Pick<DashboardViewTab, "kind">[]): DashboardViewKind[] {
  const seen = new Set<DashboardViewKind>();
  const kinds: DashboardViewKind[] = [];
  for (const tab of tabs) {
    if (seen.has(tab.kind)) {
      continue;
    }
    seen.add(tab.kind);
    kinds.push(tab.kind);
  }
  return kinds;
}
