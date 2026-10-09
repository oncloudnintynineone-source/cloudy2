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

import { monthGridMonths, monthsInRange, weekDays, type WeekStart } from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";
import type { ScheduleUser } from "@/lib/events/schedule";
import type { EventTypeOption } from "@/lib/dashboard/types";
import type { QuickLinkMenuItem } from "@/lib/quickLinks/types";
import {
  type DashboardTabFilters,
  type DashboardViewKind,
  type DashboardViewTab,
} from "@/lib/dashboardViews/views";
import type {
  ReorderDrag,
  SavedEventToastVariant,
  TranslucencyLevel,
} from "@/lib/settings/featureFlags";
import type { TitleRecipe } from "@/lib/settings/titleRecipe";

/**
 * Bump when the snapshot shape changes incompatibly. A stored record whose
 * version differs is ignored (and overwritten on the next successful load), so
 * a deploy that changes the shape can never feed the new UI a stale record.
 */
export const DASHBOARD_SNAPSHOT_VERSION = 7;

/** The one-shot `?refresh=` nonce is honored only within this window. */
export const REFRESH_NONCE_TTL_MS = 5 * 60_000;

/**
 * The serializable data the Calendar page renders: everything the server
 * resolves and the client can render without a round trip. Device-local and
 * one-shot URL state (month/date/zoom/deep-link ids) is deliberately excluded —
 * the record carries the resolved period in its context instead, and the view
 * supplies those view-local fields itself. Owned here (not derived from the
 * view's props) so the cached shape is a deliberate contract, independent of
 * any component.
 */
export interface DashboardSnapshot {
  /**
   * The dashboard's on-demand tabs in strip order (server-side per account —
   * src/lib/dashboardViews). The server resolves the active tab from the URL
   * `?view=` / remembered state.
   */
  tabs: DashboardViewTab[];
  /**
   * The tab being rendered: its kind picks the renderer/anchored semantics,
   * its stored filters resolve to the `selected*` fields.
   */
  activeView: DashboardViewTab;
  /** Whether the user can create/rename/reorder/delete tabs (false for the
   *  break-glass admin session, which has no stored views). */
  canManageViews: boolean;
  events: CalendarEvent[];
  calendars: { id: string; name: string; sortOrder: number; parentId: string | null }[];
  eventTypes: EventTypeOption[];
  /** Event type groups in display order, for the grouped type picker. */
  eventTypeGroups: { id: string; name: string; sortOrder: number; collapsible: boolean }[];
  eventTitleRecipe: TitleRecipe;
  viewEventTitleRecipe: TitleRecipe;
  googleConfigured: boolean;
  /**
   * Post-save event confirmation style (Settings → Feature Flags): whether the
   * "Event created/updated" feedback is the classic action pill, a restyled
   * pill, a standard toast with a "View event" action, or a plain toast.
   */
  savedEventToastVariant: SavedEventToastVariant;
  /**
   * Frosted-glass translucency level (Settings → Feature Flags): subtle /
   * medium / strong. The shell applies it globally as `data-c2-glass`.
   */
  translucencyLevel: TranslucencyLevel;
  /**
   * Reorder interaction (Settings → Feature Flags): the Manage-views list's
   * drag handle / up-down chevrons.
   */
  reorderDrag: ReorderDrag;
  /**
   * Which day the account's calendar week starts on (per-user preference).
   * Drives every week/month grid's `firstDayOfWeek` and the months a view
   * fetches (`requiredMonths`), so server and client agree.
   */
  weekStartsOn: WeekStart;
  /**
   * Enabled quick links in menu order (Settings → Quick Links); the amber
   * Quick-links launcher renders only when at least one is set.
   */
  quickLinks: QuickLinkMenuItem[];
  selectedCalendarIds: string[];
  selectedTypes: string[];
  selectedUserIds: string[];
  /** The role defaults this user's tab filters fall back to (admin: all
   *  calendars; non-admin: their own department; users/types: none). */
  defaultFilters: DashboardTabFilters;
  currentUser: string;
  /** Admin may edit any event and bypass the organizer-only lock. */
  isAdmin: boolean;
  scheduleUsers: ScheduleUser[];
  /** Full active roster: row source when the Users filter narrows the rows. */
  allActiveUsers: ScheduleUser[];
  inviteeDepartments: { id: string; name: string; sortOrder: number; parentId: string | null }[];
  inviteeUsers: {
    id: string;
    name: string;
    shortname: string | null;
    departmentName: string | null;
    departmentSort: number | null;
    departmentId: string | null;
    departmentParentId: string | null;
    displayName: string;
  }[];
  /** Filter dialog user options: users of the selected departments + self. */
  filterUsers: {
    id: string;
    name: string;
    departmentName: string | null;
    departmentSort: number | null;
    departmentId: string | null;
    departmentParentId: string | null;
  }[];
  peopleNames: Record<string, string>;
  calendarNames: Record<string, string>;
  currentUserName: string;
}

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
 * Replace one tab in a snapshot with its updated definition (a rename / kind
 * change from Manage views) so the tab strip and the manage list paint before
 * the authoritative re-read lands. When the patched tab is the active view, its
 * `activeView` is patched too. The `context` is deliberately left untouched —
 * the follow-up `revalidate()` owns the request-key/period correction (a kind
 * change can alter `requiredMonths`). Pure; returns the record unchanged when
 * the tab is unknown.
 */
export function patchSnapshotTab(
  record: DashboardSnapshotRecord,
  tab: DashboardViewTab,
): DashboardSnapshotRecord {
  const index = record.data.tabs.findIndex((candidate) => candidate.id === tab.id);
  if (index === -1) {
    return record;
  }
  const tabs = [...record.data.tabs];
  tabs[index] = tab;
  const data: DashboardSnapshot = {
    ...record.data,
    tabs,
    activeView: record.data.activeView.id === tab.id ? tab : record.data.activeView,
  };
  return { ...record, data };
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
 * - Week (H) / Week (D) / Week (Grid): the months the week touches, from the
 *   account's week-start day (1-2).
 * - Day / Agenda: the single containing month.
 * - Dual Pane: the 6-week grid's months (`monthGridMonths`), exactly like
 *   Month — it is day-anchored, and its Month pane always shows the agenda
 *   day's month, so the grid's months already cover the agenda day.
 *
 * Pure and client-safe (reuses the `datetime.ts` helpers), so the server
 * (`buildDashboardData`) and the client (`DashboardScreen`) compute the same
 * set for the same input.
 */
export function requiredMonths(
  kind: DashboardViewKind,
  month: string,
  date: string,
  weekStartsOn: WeekStart = "monday",
): string[] {
  if (kind === "month" || kind === "dual") {
    return monthGridMonths(month, weekStartsOn);
  }
  if (kind === "week" || kind === "weekv2" || kind === "weekgrid") {
    const week = weekDays(date, weekStartsOn);
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
 * Per-tab load state for the tab strip's treatment. The strip shows each view's
 * own load progress instead of a single shared "busy" flag:
 *
 * - `fresh` — a warm snapshot for the tab's key exists (any age), so a tap
 *   paints it instantly and a stale one revalidates silently in place. Rendered
 *   solid. The active tab is always `fresh` (you're looking at its data) unless
 *   a read for it is in flight.
 * - `loading` — a read for this tab's key is in flight (the active/on-tap read
 *   or the background preload). Rendered with a sweeping amber loading bar.
 * - `not-loaded` — no warm copy and no fetch. Rendered faded, static.
 *
 * Pure and client-safe so the mapping is unit-testable.
 */
export type TabLoadState = "fresh" | "loading" | "not-loaded";

export function tabLoadStates(params: {
  tabs: readonly Pick<DashboardViewTab, "id" | "kind">[];
  month: string;
  date: string;
  /** The account's week start, so the request keys match the server's. */
  weekStartsOn: WeekStart;
  /** Keys with a warm snapshot of any age. */
  warmKeys: ReadonlySet<string>;
  /** Keys with an in-flight read (active/on-tap). */
  loadingKeys: ReadonlySet<string>;
  /** The tab currently displayed; it is always fresh unless loading. */
  activeTabId: string | null;
}): Record<string, TabLoadState> {
  const states: Record<string, TabLoadState> = {};
  for (const tab of params.tabs) {
    const key = dashboardRequestKey({
      viewId: tab.id,
      months: requiredMonths(tab.kind, params.month, params.date, params.weekStartsOn),
    });
    let state: TabLoadState;
    if (params.loadingKeys.has(key)) {
      state = "loading";
    } else if (tab.id === params.activeTabId || params.warmKeys.has(key)) {
      state = "fresh";
    } else {
      state = "not-loaded";
    }
    states[tab.id] = state;
  }
  return states;
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

/**
 * Bound the in-memory warm map to the same cap as the on-disk store, evicting
 * the oldest contexts first. The preload can warm every tab (up to 20), so
 * without this the map — each record a full snapshot — grows unbounded. The
 * displayed record is held separately, so evicting it here only drops it as a
 * warm *cache* entry, never from the screen.
 */
export function capSnapshotMap(
  records: ReadonlyMap<string, DashboardSnapshotRecord>,
  max: number = MAX_SNAPSHOTS_PER_USER,
): Map<string, DashboardSnapshotRecord> {
  if (records.size <= max) return records as Map<string, DashboardSnapshotRecord>;
  const newest = [...records.entries()]
    .sort((a, b) => a[1].savedAt - b[1].savedAt)
    .slice(records.size - max);
  return new Map(newest);
}
