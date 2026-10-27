"use client";

import { isDashboardViewKind, type DashboardViewKind } from "@/lib/dashboardViews/views";

import { preloadScheduleViewKinds } from "./scheduleViews";

const LAST_RENDERER_KIND_KEY = "cloudy2.dashboard.rendererKind";

const CUSTOM_RENDERERS: Partial<Record<DashboardViewKind, () => Promise<unknown>>> = {
  dual: () => import("./DualPaneView"),
  weekv2: () => import("./WeekMatrixView"),
};

export function readLastRendererKind(): DashboardViewKind | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(LAST_RENDERER_KIND_KEY);
    return isDashboardViewKind(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberRendererKind(kind: DashboardViewKind): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_RENDERER_KIND_KEY, kind);
  } catch {
    // Storage can be unavailable in private mode.
  }
}

export function preloadRendererKind(kind: DashboardViewKind): Promise<void> {
  const custom = CUSTOM_RENDERERS[kind];
  if (custom) {
    return custom().then(
      () => undefined,
      () => undefined,
    );
  }
  return preloadScheduleViewKinds([kind]);
}
