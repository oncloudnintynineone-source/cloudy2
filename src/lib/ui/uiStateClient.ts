"use client";

import { useEffect, useMemo } from "react";

import {
  UI_STATE_COOKIE,
  decodeUiState,
  encodeUiState,
  mergeUiState,
  type DashboardNavState,
  type UiState,
} from "./uiState";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // one year

function readCookieValue(name: string): string | undefined {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(document.cookie);
  return match?.[1];
}

/** Decode the current remembered-state cookie (null when absent/tampered). */
export function readUiState(): UiState | null {
  if (typeof document === "undefined") return null;
  return decodeUiState(readCookieValue(UI_STATE_COOKIE));
}

/** Read-modify-write the cookie: a patch's section replaces that section. */
export function writeUiState(patch: UiState): void {
  const current = decodeUiState(readCookieValue(UI_STATE_COOKIE)) ?? {};
  const value = encodeUiState(mergeUiState(current, patch));
  document.cookie = `${UI_STATE_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}`;
}

export function clearUiState(): void {
  document.cookie = `${UI_STATE_COOKIE}=; path=/; max-age=0`;
}

/** Remembers the bottom-nav page (incl. the /settings sub-tab) on change. */
export function useRememberedPage(pathname: string): void {
  useEffect(() => {
    if (pathname.startsWith("/")) {
      writeUiState({ lastPage: pathname });
    }
  }, [pathname]);
}

/**
 * Persists the dashboard's device-local "where you are" state (date/month
 * anchor + zoom) to the cookie whenever it changes, so a cold start (or F5)
 * lands on the same period and zoom. Snapshots by content, so re-renders with
 * identical state never rewrite the cookie.
 */
export function usePersistDashboardNav(nav: DashboardNavState): void {
  const snapshot = useMemo(() => JSON.stringify(nav), [nav]);
  useEffect(() => {
    writeUiState({ dashboard: JSON.parse(snapshot) as DashboardNavState });
  }, [snapshot]);
}
