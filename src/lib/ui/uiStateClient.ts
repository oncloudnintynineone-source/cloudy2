"use client";

import { useEffect, useMemo } from "react";

import {
  DASHBOARD_STATE_KEYS,
  PARADE_STATE_KEYS,
  UI_STATE_COOKIE,
  buildDashboardPersist,
  decodeUiState,
  encodeUiState,
  mergeUiState,
  reduceUiStateForCookie,
  type DashboardPersistSeed,
  type ParadeUiState,
  type UiState,
} from "./uiState";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // one year
// Browsers cap a cookie value around 4 KiB; keep headroom. When a state
// overflows, writeUiState trims the LEAST intentful id lists first (parade →
// shared → per-view cal/types, users last — see `reduceUiStateForCookie`) and
// only then the rest, so a large roster shrinks gracefully instead of silently
// wiping the per-view `views` map (the v1 bug this trimming rule retires). The
// per-view filter-scoping preference survives longest.
const SAFE_COOKIE_VALUE_LENGTH = 3500;

function readCookieValue(name: string): string | undefined {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(document.cookie);
  return match?.[1];
}

/** Decode the current remembered-state cookie (null when absent/tampered). */
export function readUiState(): UiState | null {
  if (typeof document === "undefined") return null;
  return decodeUiState(readCookieValue(UI_STATE_COOKIE));
}

export function writeUiState(patch: UiState): void {
  const current = decodeUiState(readCookieValue(UI_STATE_COOKIE)) ?? {};
  let merged = mergeUiState(current, patch);
  let value = encodeUiState(merged);
  // Trim toward the limit one list at a time; the reducer returns the same
  // reference when nothing is left to drop (scalars are all that remain).
  let passes = 0;
  while (value.length > SAFE_COOKIE_VALUE_LENGTH && passes++ < 12) {
    const reduced = reduceUiStateForCookie(merged);
    if (reduced === merged) break;
    merged = reduced;
    value = encodeUiState(merged);
  }
  document.cookie = `${UI_STATE_COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}`;
}

export function clearUiState(): void {
  document.cookie = `${UI_STATE_COOKIE}=; path=/; max-age=0`;
}

/**
 * Persists the just-rendered state of a page to the cookie every time it
 * changes. For the dashboard, the caller passes a `DashboardPersistSeed`; the
 * hook builds the next section from the CURRENT cookie itself (via
 * `buildDashboardPersist`), so per-view memory merges other views' existing
 * entries instead of replacing them with a fresh resolution. Writing the
 * resolved props — not the raw URL params — is what makes the cookie converge
 * to exactly what was on screen: dropped stale ids, role defaults after a
 * Clear, and the effective view/date all land correctly without touching any
 * of the views' navigation code.
 */
export function usePersistUiState(section: "dashboard", seed: DashboardPersistSeed): void;
export function usePersistUiState(section: "parade", values: ParadeUiState): void;
export function usePersistUiState(
  section: "dashboard" | "parade",
  seedOrValues: DashboardPersistSeed | ParadeUiState,
): void {
  const snapshot = useMemo(() => JSON.stringify(seedOrValues), [seedOrValues]);
  useEffect(() => {
    // `snapshot` mirrors seedOrValues' content, so the effect never needs the
    // live object in its deps (identical content re-renders rewrite nothing).
    if (section === "dashboard") {
      const seed = JSON.parse(snapshot) as DashboardPersistSeed;
      writeUiState({ dashboard: buildDashboardPersist(readUiState()?.dashboard, seed) });
    } else {
      writeUiState({ parade: JSON.parse(snapshot) as ParadeUiState });
    }
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
