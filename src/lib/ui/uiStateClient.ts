"use client";

import { useEffect, useMemo } from "react";

import {
  DASHBOARD_STATE_KEYS,
  PARADE_STATE_KEYS,
  UI_STATE_COOKIE,
  decodeUiState,
  encodeUiState,
  mergeUiState,
  type DashboardUiState,
  type ParadeUiState,
  type UiState,
} from "./uiState";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // one year
// Browsers cap a cookie value around 4 KiB; keep headroom. A state that would
// overflow drops its (largest) id lists and keeps view/date/month/lastPage.
const SAFE_COOKIE_VALUE_LENGTH = 3500;

function readCookieValue(name: string): string | undefined {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(document.cookie);
  return match?.[1];
}

export function writeUiState(patch: UiState): void {
  const current = decodeUiState(readCookieValue(UI_STATE_COOKIE)) ?? {};
  const merged = mergeUiState(current, patch);
  let value = encodeUiState(merged);
  if (value.length > SAFE_COOKIE_VALUE_LENGTH) {
    value = encodeUiState({
      ...merged,
      dashboard: merged.dashboard
        ? { view: merged.dashboard.view, date: merged.dashboard.date, month: merged.dashboard.month }
        : undefined,
      parade: merged.parade
        ? { date: merged.parade.date, month: merged.parade.month }
        : undefined,
    });
  }
  document.cookie = `${UI_STATE_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}`;
}

export function clearUiState(): void {
  document.cookie = `${UI_STATE_COOKIE}=; path=/; max-age=0`;
}

/**
 * Persists the just-rendered (server-resolved) state of a page to the cookie
 * every time it changes. Writing the resolved props — not the raw URL params —
 * is what makes the cookie converge to exactly what was on screen: dropped
 * stale ids, role defaults after a Clear, and the effective view/date all land
 * correctly without touching any of the views' navigation code.
 */
export function usePersistUiState(
  section: "dashboard" | "parade",
  values: DashboardUiState | ParadeUiState,
): void {
  const snapshot = useMemo(() => JSON.stringify(values), [values]);
  useEffect(() => {
    writeUiState({ [section]: JSON.parse(snapshot) } as UiState);
  }, [section, snapshot]);
}

/** Remembers the bottom-nav page (incl. the /settings sub-tab) on change. */
export function useRememberedPage(pathname: string): void {
  useEffect(() => {
    if (pathname.startsWith("/")) {
      writeUiState({ lastPage: pathname });
    }
  }, [pathname]);
}

export { DASHBOARD_STATE_KEYS, PARADE_STATE_KEYS };
