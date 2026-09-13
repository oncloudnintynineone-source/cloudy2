/**
 * Per-device remembered UI state — the reduced "where you are" cookie.
 *
 * Server-side per-account preferences (dashboard view tabs + filters, the
 * last-active tab, parade filters) moved into Postgres (`user_preferences`,
 * `user_dashboard_views` — see src/lib/userPrefs + src/lib/dashboardViews and
 * docs/ui-state.md). What stays in this one small cookie is the genuinely
 * device-local, transient state the PWA must restore before first paint with
 * no network round trip:
 *
 *   {
 *     lastPage?: string,            // bottom-nav path, incl. /settings sub-tab
 *     sidebarCollapsed?: boolean,   // desktop sidebar minimized to the icon rail
 *     dashboard?: {                 // per-device dashboard "where you are"
 *       date?: string,              //   day-anchored views
 *       month?: string,             //   Month view
 *       zoom?: number               //   Day/Week (H) hour-slot zoom (slotZoom.ts)
 *       monthZoom?: number          //   Month grid zoom (monthZoom.ts)
 *       dualSplit?: number          //   Dual Pane month/agenda split (dualSplit.ts)
 *     }
 *   }
 *
 * Everything else the old cookie carried — the active view/tab, per-view
 * filter memory, `pinnedViews`, `filterMode`, the parade filters — is now
 * either server-side or gone, and `decodeUiState` drops those keys if a
 * legacy cookie still carries them. The URL remains the source of truth for
 * the current tab (`?view=<tab id>`) and date/month anchor; the cookie fills
 * gaps per key so a cold start (or F5) lands where the user left off.
 *
 * The encoded value is `{ v: [major, minor], ...state }` — see the COOKIE
 * VERSIONING block below: a major mismatch drops the cookie entirely, a newer
 * minor decodes as-is, an older minor runs the migration chain.
 */

import { clampZoom } from "./slotZoom";
import { clampMonthZoom } from "./monthZoom";
import { clampDualSplit } from "./dualSplit";

export const UI_STATE_COOKIE = "cloudy2.ui";

/**
 * Per-device dashboard "where you are". `zoom` is the Day/Week (H) hour-slot
 * zoom (slotZoom.ts); `monthZoom` is the Month grid's fit-width multiplier
 * (monthZoom.ts) — two separate keys because each view remembers its own level;
 * `dualSplit` is the Dual Pane month/agenda width split (dualSplit.ts).
 */
export interface DashboardNavState {
  date?: string;
  month?: string;
  zoom?: number;
  monthZoom?: number;
  dualSplit?: number;
}

export interface UiState {
  lastPage?: string;
  /** Desktop sidebar minimized to the icon rail (desktop-only, no-op below lg). */
  sidebarCollapsed?: boolean;
  dashboard?: DashboardNavState;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOf(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Coerce an arbitrary decoded value into a sane UiState. Anything mismatched
 * is dropped rather than thrown: a corrupted cookie must degrade to "no
 * remembered state", never break a page render.
 */
export function normalizeUiState(value: unknown): UiState | null {
  if (!isPlainObject(value)) return null;
  const state: UiState = {};
  const lastPage = stringOf(value.lastPage);
  if (lastPage !== undefined && lastPage.startsWith("/")) {
    state.lastPage = lastPage;
  }
  if (typeof value.sidebarCollapsed === "boolean") {
    state.sidebarCollapsed = value.sidebarCollapsed;
  }
  const dashboard = isPlainObject(value.dashboard) ? value.dashboard : undefined;
  if (dashboard !== undefined) {
    const section: DashboardNavState = {};
    const date = stringOf(dashboard.date);
    const month = stringOf(dashboard.month);
    const zoom = clampZoom(dashboard.zoom);
    const monthZoom = clampMonthZoom(dashboard.monthZoom);
    const dualSplit = clampDualSplit(dashboard.dualSplit);
    if (date !== undefined) section.date = date;
    if (month !== undefined) section.month = month;
    if (zoom !== null) section.zoom = zoom;
    if (monthZoom !== null) section.monthZoom = monthZoom;
    if (dualSplit !== null) section.dualSplit = dualSplit;
    if (Object.keys(section).length > 0) {
      state.dashboard = section;
    }
  }
  return state;
}

function toBase64Url(value: string): string {
  const binary = btoa(
    Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join(""),
  );
  return binary.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  let b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) {
    b64 += "=";
  }
  const binary = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

// --- Cookie schema versioning ---
//
// Major 3: the cookie shrank to the device-local "where you are" keys above.
// A v2 cookie (per-view filters, pinnedViews, parade filters, active view)
// decodes to null — that data is either server-side now or superseded — and
// the writer re-stamps the current shape on the next write. The rules below
// are unchanged: a major mismatch in EITHER direction drops the cookie, a
// newer minor decodes as-is (forward-compatible), an older minor runs the
// migration chain before normalization.
const COOKIE_VERSION: readonly [number, number] = [3, 2];

/**
 * Minor migrations within the CURRENT major, keyed by the minor they upgrade
 * FROM. Each returns the raw (pre-normalization) object. v3.1 adds the Month
 * grid zoom (`monthZoom`); a v3.0 cookie carries no such key, so the migration
 * is a pass-through and normalization fills the gap (no monthZoom = the fit
 * default). v3.2 adds the Dual Pane split (`dualSplit`) — likewise a
 * pass-through (no dualSplit = the default 60/40 split).
 */
const MINOR_MIGRATIONS: Record<number, (value: Record<string, unknown>) => Record<string, unknown>> =
  {
    0: (value) => value,
    1: (value) => value,
  };

function parseCookieVersion(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [major, minor] = raw;
  if (typeof major !== "number" || typeof minor !== "number") return null;
  if (!Number.isInteger(major) || !Number.isInteger(minor)) return null;
  return [major, minor];
}

/** Encode state into the cookie value: base64url(JSON), no padding. */
export function encodeUiState(state: UiState): string {
  return toBase64Url(JSON.stringify({ v: COOKIE_VERSION, ...state }));
}

/**
 * Decode + normalize a cookie value; null when absent, undecodable, or of an
 * incompatible major version. A newer minor within the current major decodes
 * as-is (forward-compatible); an older minor runs the migration chain first.
 * Always total — never throws.
 */
export function decodeUiState(raw: string | null | undefined): UiState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(raw));
    if (!isPlainObject(parsed)) return null;
    const version = parseCookieVersion(parsed.v);
    if (!version) return null; // legacy pre-versioning cookie
    const [storedMajor, storedMinor] = version;
    if (storedMajor !== COOKIE_VERSION[0]) return null; // past or future major
    if (storedMinor > COOKIE_VERSION[1]) {
      // newer minor from a future build: fields we know decode, the rest are
      // dropped by normalizeUiState — never a migration target.
      delete parsed.v;
      return normalizeUiState(parsed);
    }
    let value: Record<string, unknown> = parsed;
    for (let m = storedMinor; m < COOKIE_VERSION[1]; m++) {
      const migration = MINOR_MIGRATIONS[m];
      if (!migration) return null; // cannot migrate — programming error, drop
      value = migration(value);
    }
    delete value.v;
    return normalizeUiState(value);
  } catch {
    return null;
  }
}

/** Shallow merge: defined patch keys (incl. a whole section) replace. */
export function mergeUiState(current: UiState, patch: UiState): UiState {
  return {
    ...(current.lastPage !== undefined || patch.lastPage !== undefined
      ? { lastPage: patch.lastPage ?? current.lastPage }
      : {}),
    ...(current.sidebarCollapsed !== undefined || patch.sidebarCollapsed !== undefined
      ? { sidebarCollapsed: patch.sidebarCollapsed ?? current.sidebarCollapsed }
      : {}),
    ...(patch.dashboard !== undefined
      ? { dashboard: patch.dashboard }
      : current.dashboard !== undefined
        ? { dashboard: current.dashboard }
        : {}),
  };
}

// Exported because the PWA launch shell (public/loading.html) has to resolve
// the same targets in plain inline JS, before any bundle loads. Its copy is
// kept honest by src/lib/pwa/launchShell.test.ts.
export const BASE_PAGES = ["/dashboard", "/parade-state", "/contacts"];
export const SETTINGS_SUBTABS = [
  "/settings/users",
  "/settings/departments",
  "/settings/event-types",
  "/settings/templates",
  "/settings/general",
  "/settings/audit-log",
];

/**
 * Where a cold start lands: the remembered last page, whitelisted against the
 * routes that actually exist (and role-scoped: /settings is admin-only).
 * Anything unknown falls back to /dashboard.
 */
export function resolveLaunchTarget(
  lastPage: string | undefined,
  role: "admin" | "user",
): string {
  if (typeof lastPage !== "string" || !lastPage.startsWith("/")) {
    return "/dashboard";
  }
  if (lastPage === "/settings") {
    return role === "admin" ? "/settings/users" : "/dashboard";
  }
  if (lastPage.startsWith("/settings/")) {
    if (role !== "admin") return "/dashboard";
    return SETTINGS_SUBTABS.includes(lastPage) ? lastPage : "/settings/users";
  }
  return BASE_PAGES.includes(lastPage) ? lastPage : "/dashboard";
}
