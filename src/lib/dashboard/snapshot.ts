/**
 * Device-local dashboard snapshot: the serializable data the Calendar page
 * renders, cached in IndexedDB so a cold PWA open can paint the last-known
 * grid instantly and revalidate in the background (docs/pwa-offline.md).
 *
 * This module is pure and client-safe (no IndexedDB, no React): the type, the
 * cache-key derivation, the version guard and the one-shot refresh-nonce check
 * all live here so they can be unit-tested. The IndexedDB glue is in
 * `localStore.ts`; the server-side builder is in `data.ts`.
 */

import type { DashboardViewProps } from "@/app/(protected)/dashboard/DashboardView";
import {
  monthGridMonths,
  monthsInRange,
  weekDays,
} from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";
import {
  resolveActiveTab,
  type DashboardTabFilters,
  type DashboardViewKind,
  type DashboardViewTab,
} from "@/lib/dashboardViews/views";

/**
 * Bump when the snapshot shape changes incompatibly. A stored record whose
 * version differs is ignored (and overwritten on the next successful load), so
 * a deploy that changes the shape can never feed the new UI a stale record.
 */
export const DASHBOARD_SNAPSHOT_VERSION = 1;

/** The one-shot `?refresh=` nonce is honored only within this window. */
export const REFRESH_NONCE_TTL_MS = 5 * 60_000;

/**
 * The data-bearing subset of {@link DashboardViewProps}: everything the server
 * resolves and the client can render without a round trip. Device-local and
 * one-shot URL state (month/date/zoom/deep-link ids) is excluded — the record
 * carries the resolved period in its context instead.
 */
export type DashboardSnapshot = Omit<
  DashboardViewProps,
  | "month"
  | "date"
  | "initialZoom"
  | "initialMonthZoom"
  | "initialEditEventId"
  | "initialDetailEventId"
  | "deepLinkEvent"
>;

/**
 * The snapshot fields every tab renders identically (calendars, event types,
 * users, settings, quick links, names). The per-tab variable fields are split
 * into {@link DashboardTabDelta}; `assembleDashboardSnapshot` recombines them.
 * The tab preload ships one shared config plus a delta per tab instead of N full
 * snapshots (docs/pwa-offline.md §1.18).
 */
export type DashboardSharedConfig = Omit<
  DashboardSnapshot,
  | "activeView"
  | "events"
  | "selectedCalendarIds"
  | "selectedTypes"
  | "selectedUserIds"
  | "viewEventTitleRecipe"
  | "scheduleUsers"
  | "filterUsers"
>;

/** The per-tab variable snapshot fields, projected from the shared range read. */
export interface DashboardTabDelta {
  activeView: DashboardViewTab;
  events: DashboardSnapshot["events"];
  selectedCalendarIds: string[];
  selectedTypes: string[];
  selectedUserIds: string[];
  viewEventTitleRecipe: DashboardSnapshot["viewEventTitleRecipe"];
  scheduleUsers: DashboardSnapshot["scheduleUsers"];
  filterUsers: DashboardSnapshot["filterUsers"];
}

/** Recombine the shared config with one tab's delta into a renderable snapshot. */
export function assembleDashboardSnapshot(
  shared: DashboardSharedConfig,
  delta: DashboardTabDelta,
): DashboardSnapshot {
  return { ...shared, ...delta };
}

/**
 * What the snapshot was rendered for. `requestKey` is the data-affecting
 * fingerprint (the resolved tab id + the months it spans — never the day or the
 * one-shot edit/event/refresh params), so a background revalidation of the same
 * context doesn't read as a navigation, and an in-month day move doesn't fetch.
 */
export interface DashboardSnapshotContext {
  month: string;
  date: string;
  viewId: string;
  requestKey: string;
}

export interface DashboardSnapshotRecord {
  version: number;
  savedAt: number;
  context: DashboardSnapshotContext;
  data: DashboardSnapshot;
  /**
   * The `?event=` deep link's target event, resolved separately from the grid
   * (so a filtered-out event still opens). URL-scoped, so it lives on the
   * record root and is never written to IndexedDB (which persists `data` +
   * `context` only).
   */
  deepLinkEvent?: CalendarEvent | null;
}

/**
 * The months a view's data actually depends on. This is the unit the server
 * reads and the client's fetch identity is built from, so a day move inside an
 * already-loaded month is not a data change:
 *
 * - Month: the 6-week grid's months (`monthGridMonths`, 2-3).
 * - Week (H) / Week (D): the months the Monday-first week touches (1-2).
 * - Day / Agenda: the single containing month.
 *
 * Pure and client-safe (reuses the `datetime.ts` helpers), so the server
 * (`buildDashboardData`) and the client (`DashboardScreen`) compute the same
 * set for the same input.
 */
export function requiredMonths(kind: DashboardViewKind, month: string, date: string): string[] {
  if (kind === "month") {
    return monthGridMonths(month);
  }
  if (kind === "week" || kind === "weekv2") {
    const week = weekDays(date);
    return monthsInRange(week[0], week[6]);
  }
  return [month];
}

/**
 * Stable fingerprint of the data a dashboard render holds: the active tab id
 * plus the months it spans. The day within a month is deliberately absent (and
 * so are the one-shot `edit`/`event`/`_eventCal`/`refresh` params), so an
 * in-month day move is never treated as a context change — no refetch, no
 * skeleton.
 */
export function dashboardRequestKey(params: { viewId: string; months: string[] }): string {
  const months = [...new Set(params.months)].sort();
  return `${params.viewId}|${months.join(",")}`;
}

/**
 * The fetch signature the current URL asks for, given the last loaded record:
 * the resolved tab id plus the months that tab needs (see `requiredMonths`).
 *
 * The day within a month is intentionally absent, so an in-month day move
 * produces the same signature as the held record and triggers no fetch — the
 * URL day still drives the rendered grid/chrome directly (`DashboardScreen`
 * passes it as the URL-first `date` prop), it just never reaches the server.
 *
 * Month precedence mirrors the server (`buildDashboardData`): an explicit
 * `?date=` wins (its month is authoritative), then `?month=`, then the held
 * record's context. Returns null before the first record is available (the
 * mount read always runs).
 */
export function dashboardCandidateRequestKey(
  record: DashboardSnapshotRecord | null,
  urlView: string | null,
  urlMonth: string | null,
  urlDate: string | null,
): string | null {
  if (!record) return null;
  const tab =
    resolveActiveTab(urlView, record.data.activeView.id, record.data.tabs) ??
    record.data.activeView;
  const month = urlDate ? urlDate.slice(0, 7) : (urlMonth ?? record.context.month);
  const date = urlDate ?? record.context.date;
  return dashboardRequestKey({
    viewId: tab.id,
    months: requiredMonths(tab.kind, month, date),
  });
}

/** Null-aware, order-insensitive equality of a stored filter override. */
function filterArraysEqual(a: string[] | null, b: string[] | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((id) => set.has(id));
}

/**
 * Whether two tabs' stored filter overrides are equivalent. `null` means "role
 * default" and is deliberately distinct from `[]` (an explicit empty selection),
 * which the server resolves to "no events".
 */
export function dashboardTabFiltersEqual(a: DashboardTabFilters, b: DashboardTabFilters): boolean {
  return (
    filterArraysEqual(a.cal, b.cal) &&
    filterArraysEqual(a.users, b.users) &&
    filterArraysEqual(a.types, b.types)
  );
}

/** Set equality for two month lists (order-insensitive). */
function monthSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((month) => set.has(month));
}

/**
 * The target tab when switching to it can reuse the held record's data: same
 * kind, same required months, and equivalent stored filter overrides. The
 * server resolves those overrides against the same live data, so equal raw
 * overrides resolve to the same selection — `events`, `selected*` and the
 * kind-keyed title recipe are unchanged; only the tab identity differs, which
 * `DashboardScreen` swaps locally instead of re-reading. Returns null when the
 * target is unknown, is the held tab, or differs in any data-affecting way.
 */
export function equivalentDashboardTab(
  record: DashboardSnapshotRecord,
  urlView: string | null,
  urlMonth: string | null,
  urlDate: string | null,
): DashboardViewTab | null {
  const held = record.data.activeView;
  const target = resolveActiveTab(urlView, held.id, record.data.tabs);
  if (!target || target.id === held.id) return null;
  if (target.kind !== held.kind) return null;
  if (!dashboardTabFiltersEqual(target.filters, held.filters)) return null;
  const month = urlDate ? urlDate.slice(0, 7) : (urlMonth ?? record.context.month);
  const date = urlDate ?? record.context.date;
  if (
    !monthSetsEqual(
      requiredMonths(target.kind, month, date),
      requiredMonths(held.kind, record.context.month, record.context.date),
    )
  ) {
    return null;
  }
  return target;
}

/**
 * What the view should render for the current URL, given the held record.
 * Separates the URL's intent from the server-committed data so a tab/period
 * navigation can follow the URL immediately while the fetch is still in flight:
 *
 * - `activeView` is the URL-resolved tab while the data is healthy (fresh, not
 *   failed), so the chrome and renderer kind move the instant the URL changes —
 *   no optimistic-then-revert flicker. It falls back to the held tab while a
 *   cached record paints (keeping the cached tab consistent with its data) and
 *   after a failed fetch (healing an offline navigation back to the loaded tab).
 * - `covered` is true when the held data already answers the URL context — the
 *   request key matches, or the target is a data-equivalent tab.
 * - `isNavigating` is true only for an uncovered, un-failed context on fresh
 *   data, i.e. exactly when the grid should show its skeleton. It is not tied to
 *   the router transition, so it can't flash or gap around the data fetch.
 */
export interface DashboardPresentation {
  activeView: DashboardViewTab;
  covered: boolean;
  isNavigating: boolean;
}

export function resolveDashboardPresentation(
  record: DashboardSnapshotRecord,
  urlView: string | null,
  urlMonth: string | null,
  urlDate: string | null,
  opts: { cached: boolean; failedKey: string | null },
): DashboardPresentation {
  const candidateKey = dashboardCandidateRequestKey(record, urlView, urlMonth, urlDate);
  const covered =
    (candidateKey !== null && record.context.requestKey === candidateKey) ||
    equivalentDashboardTab(record, urlView, urlMonth, urlDate) !== null;
  const fetchFailed = candidateKey !== null && opts.failedKey === candidateKey;
  const isNavigating = !opts.cached && !covered && !fetchFailed;
  const urlTab =
    resolveActiveTab(urlView, record.data.activeView.id, record.data.tabs) ??
    record.data.activeView;
  const activeView = opts.cached || fetchFailed ? record.data.activeView : urlTab;
  return { activeView, covered, isNavigating };
}

/** Whether a stored value matches the current snapshot shape. */
export function isSnapshotRecordUsable(record: unknown): record is DashboardSnapshotRecord {
  if (typeof record !== "object" || record === null) {
    return false;
  }
  const candidate = record as DashboardSnapshotRecord;
  return (
    candidate.version === DASHBOARD_SNAPSHOT_VERSION &&
    !!candidate.context &&
    typeof candidate.context.month === "string" &&
    typeof candidate.context.date === "string" &&
    typeof candidate.context.requestKey === "string" &&
    !!candidate.data
  );
}

/**
 * Whether a `?refresh=` value is a fresh, valid one-shot nonce. Mirrors the
 * server's window so the client and server agree on when a forced read is
 * honored (a stale back/forward history entry must not silently re-force).
 */
export function isRefreshNonceFresh(raw: string | null | undefined, now: number): boolean {
  if (!raw) return false;
  const nonce = Number(raw);
  return Number.isFinite(nonce) && now - nonce < REFRESH_NONCE_TTL_MS;
}

/**
 * How long a device-cached context is treated as fresh, so switching back to a
 * recently viewed tab paints instantly without a background re-read. Aligned
 * with the server events cache's fresh window (`GCAL_CACHE_FRESH_MS`).
 */
export const WARM_SNAPSHOT_FRESH_MS = 60_000;

/**
 * How many device-cached contexts to keep per account. Contexts are
 * `tab × visited period`, so they grow without bound, and each record is a full
 * snapshot (events plus the duplicated config), so the cap bounds disk usage,
 * the cold-start hydration parse, and the risk of silently hitting the
 * IndexedDB quota (`localStore` swallows write failures). Set to cover the
 * preloaded tabs for a typical account (the tab preload warms every tab for the
 * current anchor); the oldest contexts evict first by LRU.
 */
export const MAX_SNAPSHOTS_PER_USER = 12;

/** The IndexedDB key for one account's cached context. */
export function snapshotStorageKey(userId: string, requestKey: string): string {
  return `${userId}::${requestKey}`;
}

/** Whether a cached context is recent enough to serve without a re-read. */
export function isWarmSnapshotFresh(savedAt: number, now: number): boolean {
  return now - savedAt < WARM_SNAPSHOT_FRESH_MS;
}

/**
 * The keys to delete so at most `max` contexts remain for `userId`, oldest
 * first. Entries for other accounts are ignored. Pure so the LRU policy is
 * unit-tested without IndexedDB.
 */
export function selectSnapshotsToEvict(
  entries: readonly { key: string; savedAt: number }[],
  userId: string,
  max: number = MAX_SNAPSHOTS_PER_USER,
): string[] {
  const prefix = `${userId}::`;
  const mine = entries
    .filter((entry) => entry.key.startsWith(prefix))
    .sort((a, b) => a.savedAt - b.savedAt);
  const excess = mine.length - max;
  return excess > 0 ? mine.slice(0, excess).map((entry) => entry.key) : [];
}
