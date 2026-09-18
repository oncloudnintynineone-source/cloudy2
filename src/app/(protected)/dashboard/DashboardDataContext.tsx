"use client";

import { createContext, useContext } from "react";

import type { TabLoadState } from "@/lib/dashboard/snapshot";
import type { DashboardViewTab } from "@/lib/dashboardViews/views";

/**
 * Dashboard data context (docs/pwa-offline.md).
 *
 * `DashboardScreen` owns the snapshot and the background revalidation; the
 * mounted `DashboardView` reads this to trigger a refresh after a mutation
 * (instead of `router.refresh()`, which no longer carries data) and to know
 * whether a context change is in flight.
 *
 * Deliberately holds only the values the view *needs* and that change on
 * navigation — `tabStatus`, `previewView` and the refresh flag were moved out
 * (tabStatus to its own context below) so a background preload or a tab tap
 * can't re-render the whole 4,600-line view.
 */
export interface DashboardDataValue {
  /**
   * Re-read the current context's data from the server and swap it in place.
   * `report: false` marks a "view load" (a filter apply) that shouldn't surface
   * on the global activity bar — the active tab's loading bar covers it instead.
   * Post-mutation / view-CRUD refreshes keep the default (bar shown). An
   * optional `params` override supplies the target URL for a definition change
   * (a view's kind edited in place) whose navigation hasn't committed yet.
   */
  revalidate: (options?: { report?: boolean; params?: URLSearchParams }) => void;
  /**
   * A data fetch for a *different* context is in flight (a month/tab/date
   * navigation). Drives the grid skeleton, exactly like a route transition did.
   */
  isNavigating: boolean;
  /**
   * The optimistically tapped tab id (set on a tab tap, before the URL
   * navigation commits). `DashboardScreen` resolves the displayed context from
   * `previewView ?? searchParams.view`, so a warm tab paints instantly instead
   * of waiting on the RSC round-trip. Null once the URL catches up.
   */
  setPreviewView: (viewId: string | null) => void;
  /**
   * Patch one tab's definition (name / kind) in the held snapshot so a Manage-
   * views edit paints instantly, before the authoritative `revalidate()` read
   * lands. A no-op when the tab is unknown to the held record.
   */
  applyViewTab: (tab: DashboardViewTab) => void;
}

const DashboardDataContext = createContext<DashboardDataValue | null>(null);

export function useDashboardData(): DashboardDataValue {
  const value = useContext(DashboardDataContext);
  if (value === null) {
    throw new Error("useDashboardData must be used within DashboardScreen");
  }
  return value;
}

export const DashboardDataProvider = DashboardDataContext.Provider;

/**
 * Per-tab load state, keyed by tab id, for the tab strip's text treatment
 * (loaded = solid, loading = a sweeping amber bar, not-loaded = faded). Split
 * from the data context so the frequent preload ticks only re-render the small
 * tab-strip child that reads it.
 */
const DashboardTabStatusContext = createContext<Record<string, TabLoadState> | null>(null);

export function useDashboardTabStatus(): Record<string, TabLoadState> {
  const value = useContext(DashboardTabStatusContext);
  if (value === null) {
    throw new Error("useDashboardTabStatus must be used within DashboardScreen");
  }
  return value;
}

export const DashboardTabStatusProvider = DashboardTabStatusContext.Provider;
