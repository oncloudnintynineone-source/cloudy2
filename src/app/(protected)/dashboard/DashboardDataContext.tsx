"use client";

import { createContext, useContext } from "react";

import type { TabLoadState } from "@/lib/dashboard/snapshot";

/**
 * Dashboard data context (docs/pwa-offline.md).
 *
 * `DashboardScreen` owns the snapshot and the background revalidation; the
 * mounted `DashboardView` reads this to trigger a refresh after a mutation
 * (instead of `router.refresh()`, which no longer carries data) and to know
 * whether a context change is in flight.
 */
export interface DashboardDataValue {
  /**
   * Re-read the current context's data from the server and swap it in place.
   * `report: false` marks a "view load" (a filter apply) that shouldn't surface
   * on the global activity bar — the active tab's breathing covers it instead.
   * Post-mutation / view-CRUD refreshes keep the default (bar shown).
   */
  revalidate: (options?: { report?: boolean }) => void;
  /** A revalidation of the currently displayed context is in flight. */
  isRevalidating: boolean;
  /**
   * A data fetch for a *different* context is in flight (a month/tab/date
   * navigation). Drives the grid skeleton, exactly like a route transition did.
   */
  isNavigating: boolean;
  /**
   * Per-tab load state, keyed by tab id, for the tab strip's text treatment
   * (loaded = solid, loading = faded + breathing, not-loaded = faded).
   */
  tabStatus: Record<string, TabLoadState>;
  /**
   * The optimistically tapped tab id (set on a tab tap, before the URL
   * navigation commits). `DashboardScreen` resolves the displayed context from
   * `previewView ?? searchParams.view`, so a warm tab paints instantly instead
   * of waiting on the RSC round-trip. Null once the URL catches up.
   */
  previewView: string | null;
  /** Sets the optimistic active tab (null clears it). */
  setPreviewView: (viewId: string | null) => void;
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
