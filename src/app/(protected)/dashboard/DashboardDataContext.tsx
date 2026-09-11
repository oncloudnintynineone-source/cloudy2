"use client";

import { createContext, useContext } from "react";

/**
 * Dashboard data context (docs/pwa-offline.md).
 *
 * `DashboardScreen` owns the snapshot and the background revalidation; the
 * mounted `DashboardView` reads this to trigger a refresh after a mutation
 * (instead of `router.refresh()`, which no longer carries data) and to know
 * whether a context change is in flight.
 */
export interface DashboardDataValue {
  /** Re-read the current context's data from the server and swap it in place. */
  revalidate: () => void;
  /** A revalidation of the currently displayed context is in flight. */
  isRevalidating: boolean;
  /**
   * A data fetch for a *different* context is in flight (a month/tab/date
   * navigation). Drives the grid skeleton, exactly like a route transition did.
   */
  isNavigating: boolean;
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
