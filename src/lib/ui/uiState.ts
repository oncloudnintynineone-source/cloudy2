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
 *     sidebarCollapsed?: boolean,  // desktop sidebar minimized to the icon rail
 *     dashboard?: { view?, date?, month?, cal?: string[], users?: string[], types?: string[],
 *                    pinnedViews?: string[],  // pinned tabs, recency order (0 = leftmost)
 *                    zoom?: number },  // Day/Week (H) hour-slot zoom level (see slotZoom.ts)
 *                    filterMode?: "global" | "per-view",  // "global" (absent) = one filter set
 *                      shared by every view; "per-view" = each view remembers its own (see `views`)
 *                    views?: Record<viewKey, { cal?, users?, types? }>,  // only when per-view
 *     parade?:    { cal?: string[], users?: string[] },  // filters only — the day is NOT
 *                    remembered: a bare /parade-state always opens on today
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

import { clampZoom } from "./slotZoom";

export const UI_STATE_COOKIE = "cloudy2.ui";

/** The remembered filter keys the dashboard can scope per view. */
export const DASHBOARD_FILTER_KEYS = ["cal", "users", "types"] as const;
export type DashboardFilterKey = (typeof DASHBOARD_FILTER_KEYS)[number];

/** A fully-resolved (validated) filter set for one dashboard view. */
export type DashboardFilterSet = Record<DashboardFilterKey, string[]>;

/**
 * Dashboard filter scoping: "global" (the default, absent in the cookie)
 * shares ONE filter set across every view; "per-view" gives each view its own
 * remembered Calendars/Users/Event Types selection (stored in `views`).
 */
export type DashboardFilterMode = "global" | "per-view";

/** Remembered filter set for one dashboard view. Unlike the shared set, an
 *  EXPLICIT empty list is kept — it records "this view cleared that filter",
 *  which must not collapse back into the shared set. Absent keys fall back to
 *  the shared set / role default. */
export interface DashboardViewFilters {
  cal?: string[];
  users?: string[];
  types?: string[];
}

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
  /** Day/Week (H) hour-slot zoom level (a member of `ZOOM_LEVELS`). Shared by
   *  both views. Not URL-backed like `pinnedViews`: zooming never navigates,
   *  so the server reads it from the raw cookie even on `_fresh` renders. */
  zoom?: number;
  /** Filter scoping preference ("global" = absent). Not URL-backed like
   *  `pinnedViews`/`zoom`: changing it never navigates, so the server reads it
   *  from the raw cookie even on `_fresh` renders. */
  filterMode?: DashboardFilterMode;
  /** Per-view remembered filter sets, present only in per-view mode. A stale
   *  map in a "global" cookie is dropped so it can't leak into the shared set. */
  views?: Partial<Record<DashboardViewValue, DashboardViewFilters>>;
}

export interface ParadeUiState {
  cal?: string[];
  users?: string[];
}

export interface UiState {
  lastPage?: string;
  /** Desktop sidebar minimized to the icon rail (desktop-only, no-op below lg). */
  sidebarCollapsed?: boolean;
  dashboard?: DashboardUiState;
  parade?: ParadeUiState;
}

// The keys a remembered section tracks; `navigate()` consults these to decide
// when a navigation removes remembered state and must send `_fresh`.
// Parade's `date`/`month` are deliberately absent: the day is never read back
// from the cookie (a bare /parade-state opens on today), and no parade
// navigation ever removes them from the URL anyway.
// Dashboard's `pinnedViews` and `zoom` are also absent: neither is URL-backed,
// so pin/zoom changes never navigate and never need `_fresh`.
export const DASHBOARD_STATE_KEYS = ["view", "date", "month", "cal", "users", "types"] as const;
export const PARADE_STATE_KEYS = ["cal", "users"] as const;

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

/**
 * Resolve the dashboard view from a raw candidate (a URL `view` param or a
 * remembered cookie value): known view values pass through, anything else —
 * including an absent or invalid remembered value — degrades to "month".
 * Shared by the page and its route-level loading fallback so both resolve
 * the same shape for the same request.
 */
export function resolveDashboardView(raw: unknown): DashboardViewValue {
  return isDashboardViewValue(raw) ? raw : "month";
}

/** Display labels for the dashboard view tabs (drives the per-view scope hint). */
export const DASHBOARD_VIEW_LABELS: Record<DashboardViewValue, string> = {
  month: "Month",
  week: "Week (H)",
  weekv2: "Week (D)",
  schedule: "Day",
  agenda: "Agenda",
};

/** Resolve the filter-scoping mode: only "per-view" is truthy, anything else
 *  (absent, corrupted, unknown) degrades to the "global" default. */
export function resolveFilterMode(raw: unknown): DashboardFilterMode {
  return raw === "per-view" ? "per-view" : "global";
}

export interface DashboardFiltersResolution {
  /** The view being rendered (URL/remembered). Its filters may also be pinned
   *  by the URL; the other views never are. */
  view: DashboardViewValue;
  /** Validated URL candidate lists for the current view. Presence — including
   *  an explicit `[]` (an empty `?cal=`) — means the URL pins that key; a key
   *  with a `undefined` value is absent and lets memory/defaults take over. */
  url: Partial<Record<DashboardFilterKey, string[]>>;
  /** Per-view remembered sets (`DashboardUiState.views`, already normalized). */
  views: Partial<Record<DashboardViewValue, DashboardViewFilters>>;
  /** The shared remembered set (`DashboardUiState` cal/users/types). */
  global: DashboardViewFilters;
  /** Role defaults (admin: all calendars; non-admin: own department; the
   *  Users/Event Types filters default to nothing). */
  defaults: DashboardFilterSet;
  /** True on the one-shot `_fresh` render: the *current view* resolves from
   *  its URL params or pure role defaults (a Clear / tab switch removed its
   *  filters) while the other views keep their per-view memories — clearing
   *  one view must never wipe the others. */
  fresh?: boolean;
}

/**
 * Resolve the dashboard's filter state. One fallback order works for both
 * scoping modes because a "global" cookie carries no `views`:
 *
 *   current view:  URL (if present) → `views[view]` → `global` → role default
 *   other views:   `views[view]`    → `global`     → role default
 *
 * A per-view entry may explicitly hold an empty list ("this view cleared that
 * filter") — it wins over `global`; only an ABSENT key falls through. On a
 * `_fresh` render the current view skips `views`/`global` (its filters were
 * just removed) and resolves from the URL params or role defaults; the other
 * views are untouched.
 */
export function resolveDashboardFilters({
  view,
  url,
  views,
  global,
  defaults,
  fresh = false,
}: DashboardFiltersResolution): {
  selected: DashboardFilterSet;
  viewFilters: Record<DashboardViewValue, DashboardFilterSet>;
} {
  const resolveKey = (target: DashboardViewValue, key: DashboardFilterKey): string[] => {
    if (target === view && url[key] !== undefined) return url[key];
    if (target === view && fresh) return defaults[key];
    return views[target]?.[key] ?? global[key] ?? defaults[key];
  };
  const viewFilters = Object.fromEntries(
    DASHBOARD_VIEW_VALUES.map((target) => [
      target,
      {
        cal: resolveKey(target, "cal"),
        users: resolveKey(target, "users"),
        types: resolveKey(target, "types"),
      } satisfies DashboardFilterSet,
    ]),
  ) as Record<DashboardViewValue, DashboardFilterSet>;
  return { selected: viewFilters[view], viewFilters };
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

// Per-view list normalizer: like `idListOf` (strings only, blank entries
// dropped) but an EMPTY array is kept. In per-view mode an explicit empty list
// is a meaningful state — "this view cleared that filter" — so it must survive
// normalization instead of collapsing back into the shared set. Non-arrays are
// undefined (the key falls back to the shared set / role default).
function perViewListOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((id): id is string => typeof id === "string" && id.length > 0);
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
  if (typeof value.sidebarCollapsed === "boolean") {
    state.sidebarCollapsed = value.sidebarCollapsed;
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
    const zoom = clampZoom(dashboard.zoom);
    // Filter scoping: only the two known strings survive; anything else (incl.
    // an explicit "global") is dropped (absent = global), keeping old cookies
    // small and "no remembered preference" canonical.
    const filterMode = resolveFilterMode(dashboard.filterMode);
    // Per-view filter sets are only meaningful while per-view mode is on; a
    // stale map in a "global" cookie is dropped so it can't leak into the
    // shared set. Unknown view keys are dropped, as is a view whose sub-lists
    // are all non-arrays. An explicit EMPTY sub-list is kept — it records that
    // the view cleared that filter, distinct from "never set" (which falls
    // back to the shared set).
    let views: Partial<Record<DashboardViewValue, DashboardViewFilters>> | undefined;
    if (filterMode === "per-view" && isPlainObject(dashboard.views)) {
      const map: Partial<Record<DashboardViewValue, DashboardViewFilters>> = {};
      for (const view of DASHBOARD_VIEW_VALUES) {
        const raw = dashboard.views[view];
        if (!isPlainObject(raw)) continue;
        const set: DashboardViewFilters = {};
        for (const key of DASHBOARD_FILTER_KEYS) {
          const list = perViewListOf(raw[key]);
          if (list !== undefined) set[key] = list;
        }
        if (Object.keys(set).length > 0) map[view] = set;
      }
      if (Object.keys(map).length > 0) views = map;
    }
    if (view !== undefined) section.view = view;
    if (date !== undefined) section.date = date;
    if (month !== undefined) section.month = month;
    if (cal !== undefined) section.cal = cal;
    if (users !== undefined) section.users = users;
    if (types !== undefined) section.types = types;
    if (pinnedViews.length > 0) section.pinnedViews = pinnedViews;
    if (zoom !== null) section.zoom = zoom;
    if (filterMode === "per-view") section.filterMode = filterMode;
    if (views !== undefined) section.views = views;
    if (Object.keys(section).length > 0) {
      state.dashboard = section;
    }
  }
  const parade = isPlainObject(value.parade) ? value.parade : undefined;
  if (parade !== undefined) {
    const section: ParadeUiState = {};
    // Filters only — parade's day is never remembered (always opens on
    // today); a stale date/month in an old cookie is simply ignored here.
    const cal = idListOf(parade.cal);
    const users = idListOf(parade.users);
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
    ...(current.sidebarCollapsed !== undefined || patch.sidebarCollapsed !== undefined
      ? { sidebarCollapsed: patch.sidebarCollapsed ?? current.sidebarCollapsed }
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
