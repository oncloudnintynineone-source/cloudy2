/**
 * Per-device remembered UI state ("relaunch the app → get back where you left
 * off"). The whole state lives in ONE small cookie (see uiStateClient.ts for
 * the writer side): the browser persists the PWA relaunch on the same
 * origin, so a cookie restores on a genuine cold start with zero network
 * round-trip and no schema work. The server reads it (next/headers `cookies()`)
 * to apply the remembered values as per-key *defaults* — explicit URL params
 * always win — so restoration happens before first paint, no client redirect.
 *
 * Stored shape (all values validated on the server again exactly like URL
 * params):
 *   {
 *     lastPage?: string,        // bottom-nav path, incl. /settings sub-tab
 *     dashboard?: { view?, date?, month?, cal?: string[], users?: string[], types?: string[],
 *                    pinnedViews?: string[] },  // pinned tabs, recency order (0 = leftmost)
 *     parade?:    { date?, month?, cal?: string[], users?: string[] },
 *   }
 *
 * One-shot URL params (`edit`, `refresh`, `_fresh`) are never stored. The
 * `_fresh` marker — auto-added by the views' `navigate()` whenever a
 * remembered key is *removed* (Clear, tab switch off the anchored views) —
 * tells the server to ignore the cookie for that one render, because a bare
 * URL produced by a removal would otherwise re-apply the now-stale cookie
 * values. The post-commit state writer then persists the freshly resolved
 * values again, so the cookie always converges to what was rendered.
 */

export const UI_STATE_COOKIE = "cloudy2.ui";

export interface DashboardUiState {
  view?: string;
  date?: string;
  month?: string;
  cal?: string[];
  users?: string[];
  types?: string[];
  /** Pinned view tabs in recency order — index 0 is the most recently pinned
   *  tab and renders leftmost. Not URL-backed: the server reads it from the
   *  cookie even on `_fresh`/`edit` renders (every tab switch is a `_fresh`
   *  render, and skipping the cookie there would wipe the pins). */
  pinnedViews?: string[];
}

export interface ParadeUiState {
  date?: string;
  month?: string;
  cal?: string[];
  users?: string[];
}

export interface UiState {
  lastPage?: string;
  dashboard?: DashboardUiState;
  parade?: ParadeUiState;
}

// The dashboard keys a remembered section tracks; `navigate()` consults these
// to decide when a navigation removes remembered state and must send `_fresh`.
// `pinnedViews` is deliberately absent: it is not URL-backed, so pin changes
// never navigate and never need `_fresh`.
export const DASHBOARD_STATE_KEYS = ["view", "date", "month", "cal", "users", "types"] as const;
export const PARADE_STATE_KEYS = ["date", "month", "cal", "users"] as const;

// The dashboard's view tabs, in their default (unpinned) order.
export const DASHBOARD_VIEW_VALUES = ["month", "week", "weekv2", "schedule", "agenda"] as const;
export type DashboardViewValue = (typeof DASHBOARD_VIEW_VALUES)[number];

function isDashboardViewValue(value: unknown): value is DashboardViewValue {
  return typeof value === "string" && (DASHBOARD_VIEW_VALUES as readonly string[]).includes(value);
}

/**
 * The remembered pin list: only known view values survive, de-duplicated in
 * stored order (index 0 = most recently pinned = leftmost tab).
 */
export function normalizePinnedViews(value: unknown): DashboardViewValue[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const pinned: DashboardViewValue[] = [];
  for (const entry of value) {
    if (isDashboardViewValue(entry) && !seen.has(entry)) {
      seen.add(entry);
      pinned.push(entry);
    }
  }
  return pinned;
}

/**
 * Tab bar order: pinned tabs first (in recency order, as stored), then the
 * unpinned tabs in their default order.
 */
export function orderDashboardViews(pinned: readonly string[]): DashboardViewValue[] {
  const known = normalizePinnedViews(pinned);
  return [...known, ...DASHBOARD_VIEW_VALUES.filter((view) => !known.includes(view))];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOf(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// A remembered id list: only arrays of non-empty strings survive; an empty
// list means "unfiltered/default" and is dropped so consumers fall back to
// their role default (a non-admin's own department, parade's all-calendars).
function idListOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value.filter((id): id is string => typeof id === "string" && id.length > 0);
  return ids.length > 0 ? ids : undefined;
}

/**
 * Coerce an arbitrary decoded value into a sane UiState. Anything mismatched
 * is dropped rather than thrown: a corrupted cookie must degrade to
 * "no remembered state", never break a page render.
 */
export function normalizeUiState(value: unknown): UiState | null {
  if (!isPlainObject(value)) return null;
  const state: UiState = {};
  const lastPage = stringOf(value.lastPage);
  if (lastPage !== undefined && lastPage.startsWith("/")) {
    state.lastPage = lastPage;
  }
  const dashboard = isPlainObject(value.dashboard) ? value.dashboard : undefined;
  if (dashboard !== undefined) {
    const section: DashboardUiState = {};
    const view = stringOf(dashboard.view);
    const date = stringOf(dashboard.date);
    const month = stringOf(dashboard.month);
    const cal = idListOf(dashboard.cal);
    const users = idListOf(dashboard.users);
    const types = idListOf(dashboard.types);
    const pinnedViews = normalizePinnedViews(dashboard.pinnedViews);
    if (view !== undefined) section.view = view;
    if (date !== undefined) section.date = date;
    if (month !== undefined) section.month = month;
    if (cal !== undefined) section.cal = cal;
    if (users !== undefined) section.users = users;
    if (types !== undefined) section.types = types;
    if (pinnedViews.length > 0) section.pinnedViews = pinnedViews;
    if (Object.keys(section).length > 0) {
      state.dashboard = section;
    }
  }
  const parade = isPlainObject(value.parade) ? value.parade : undefined;
  if (parade !== undefined) {
    const section: ParadeUiState = {};
    const date = stringOf(parade.date);
    const month = stringOf(parade.month);
    const cal = idListOf(parade.cal);
    const users = idListOf(parade.users);
    if (date !== undefined) section.date = date;
    if (month !== undefined) section.month = month;
    if (cal !== undefined) section.cal = cal;
    if (users !== undefined) section.users = users;
    if (Object.keys(section).length > 0) {
      state.parade = section;
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

/** Encode state into the cookie value: base64url(JSON), no padding. */
export function encodeUiState(state: UiState): string {
  return toBase64Url(JSON.stringify(state));
}

/** Decode + normalize a cookie value; null when absent or undecodable. */
export function decodeUiState(raw: string | null | undefined): UiState | null {
  if (!raw) return null;
  try {
    return normalizeUiState(JSON.parse(fromBase64Url(raw)));
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
    ...(patch.dashboard !== undefined
      ? { dashboard: patch.dashboard }
      : current.dashboard !== undefined
        ? { dashboard: current.dashboard }
        : {}),
    ...(patch.parade !== undefined
      ? { parade: patch.parade }
      : current.parade !== undefined
        ? { parade: current.parade }
        : {}),
  };
}

/**
 * True when a navigation *removes* at least one remembered key, i.e. the next
 * render's bare URL would fall back to a stale cookie. The navigation must
 * then carry the one-shot `_fresh` marker so this render uses pure defaults.
 */
export function freshMarkerNeeded(
  updates: Record<string, string | null | undefined>,
  keys: readonly string[],
): boolean {
  return keys.some((key) => updates[key] === null);
}

const BASE_PAGES = ["/dashboard", "/parade-state", "/contacts"];
const SETTINGS_SUBTABS = [
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
