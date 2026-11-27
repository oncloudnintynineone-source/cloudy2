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

import {
  lastDayOfMonth,
  monthGridMonths,
  monthsInRange,
  shiftMonth,
  weekDays,
  type WeekStart,
} from "@/lib/events/datetime";
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
  WizardStepIndicator,
} from "@/lib/settings/featureFlags";
import type { TitleRecipe } from "@/lib/settings/titleRecipe";

/**
 * Bump when the snapshot shape changes incompatibly. A stored record whose
 * version differs is ignored (and overwritten on the next successful load), so
 * a deploy that changes the shape can never feed the new UI a stale record.
 */
export const DASHBOARD_SNAPSHOT_VERSION = 11;

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
   * Reorder interaction (Settings → Feature Flags): the Manage-views list's
   * drag handle / up-down chevrons.
   */
  reorderDrag: ReorderDrag;
  /**
   * Event wizard step indicator (Settings → Feature Flags): labelled rail,
   * desktop labels + mobile step list, or number-only circles.
   */
  wizardStepIndicator: WizardStepIndicator;
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
  /** The tab's event-name text filter, or null when none is applied. */
  selectedText: string | null;
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
  /**
   * Filter dialog user options: the active roster + self + the tab's applied
   * picks (deliberately independent of the Calendars filter, so narrowing the
   * calendars can never change what the Users filter means).
   */
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
  | "selectedText"
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
  selectedText: string | null;
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
  if (kind === "month") {
    return monthGridMonths(month, weekStartsOn);
  }
  if (kind === "week" || kind === "weekv2" || kind === "weekgrid") {
    const week = weekDays(date, weekStartsOn);
    return monthsInRange(week[0], week[6]);
  }
  return [month];
}

/**
 * How many months beyond the viewed anchor the preload also warms for the
 * active tab. The anchor month itself is always included, so "current + next
 * one" is `PRELOAD_MONTHS_AHEAD = 1`.
 *
 * Deliberately 1, not 2: every extra anchor costs a whole calendar-set payload
 * download on a cold instance (Neon bills that egress — docs/neon-usage.md),
 * and a one-month step is the overwhelmingly common navigation. Stepping two
 * months ahead simply pays a blocking read.
 */
export const PRELOAD_MONTHS_AHEAD = 1;

/**
 * How many months before the viewed anchor the preload also warms for the
 * active tab. One back covers the common "step to the previous month" case so
 * the directional grid slide (docs/loading-transitions.md §1.14.1) paints from
 * the warm cache instead of sliding a skeleton in.
 */
export const PRELOAD_MONTHS_BEHIND = 1;

/** A resolved dashboard anchor: the month being viewed plus its day. */
export interface DashboardAnchor {
  month: string;
  date: string;
}

/**
 * The anchors the preload warms, in chronological order: `behind` months back,
 * the viewed one, then `ahead` months forward. Each shifted anchor keeps the
 * same day-of-month, clamped to that month's length (Jan 31 → Feb 28/29, or
 * Dec 31 for the month back from Jan 31), so an anchored view's
 * `requiredMonths` stays consistent across the shift. Pure and client-safe so
 * the server builder and the tests agree on the same anchors.
 */
export function preloadAnchors(
  anchor: DashboardAnchor,
  ahead: number = PRELOAD_MONTHS_AHEAD,
  behind: number = PRELOAD_MONTHS_BEHIND,
): DashboardAnchor[] {
  const day = Number(anchor.date.slice(8, 10));
  const shifted = (offset: number): DashboardAnchor => {
    const month = shiftMonth(anchor.month, offset);
    const lastDay = Number(lastDayOfMonth(month).slice(8, 10));
    return { month, date: `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}` };
  };
  const anchors: DashboardAnchor[] = [];
  for (let offset = -behind; offset <= ahead; offset += 1) {
    anchors.push(offset === 0 ? anchor : shifted(offset));
  }
  return anchors;
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
 * - `fresh` — no read is in flight for this tab. Rendered solid. This includes
 *   a tab whose data has never been loaded: tabs are fetched only on tap, and an
 *   unloaded tab deliberately reads as a normal tab (no greyed-out state).
 * - `loading` — a read for this tab's key is in flight (the active/on-tap read).
 *   Rendered with a sweeping amber loading bar.
 *
 * Pure and client-safe so the mapping is unit-testable.
 */
export type TabLoadState = "fresh" | "loading";

export function tabLoadStates(params: {
  tabs: readonly Pick<DashboardViewTab, "id" | "kind">[];
  month: string;
  date: string;
  /** The account's week start, so the request keys match the server's. */
  weekStartsOn: WeekStart;
  /** Keys with an in-flight read (active/on-tap). */
  loadingKeys: ReadonlySet<string>;
}): Record<string, TabLoadState> {
  const states: Record<string, TabLoadState> = {};
  for (const tab of params.tabs) {
    const key = dashboardRequestKey({
      viewId: tab.id,
      months: requiredMonths(tab.kind, params.month, params.date, params.weekStartsOn),
    });
    states[tab.id] = params.loadingKeys.has(key) ? "loading" : "fresh";
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
    filterArraysEqual(a.types, b.types) &&
    (a.text ?? "") === (b.text ?? "")
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
 * IndexedDB quota (`localStore` swallows write failures). Sized for the warmed
 * contexts of a typical account — the active tab's previous/current/next month,
 * the tab-switch adjacent set, and the tabs actually visited (each tab is loaded
 * on demand or on intent, never preloaded as a strip) — with LRU headroom. The
 * 20-view tab cap (`MAX_VIEWS_PER_USER`) plus the adjacent anchors is the floor.
 * The oldest contexts evict first by LRU.
 */
export const MAX_SNAPSHOTS_PER_USER = 30;

/** The IndexedDB key for one account's cached context. */
export function snapshotStorageKey(userId: string, requestKey: string): string {
  return `${userId}::${requestKey}`;
}

/** Version of the per-account cold-start index record. */
export const SNAPSHOT_INDEX_VERSION = 1;

/** Metadata for one stored context, kept in the per-account index. */
export interface DashboardSnapshotIndexEntry {
  requestKey: string;
  savedAt: number;
  viewId: string;
  firstTabId: string;
  month: string;
  date: string;
}

export interface DashboardSnapshotIndex {
  v: number;
  entries: DashboardSnapshotIndexEntry[];
}

/** The IndexedDB key for one account's snapshot index. */
export function snapshotIndexStorageKey(userId: string): string {
  return `${userId}::@@index`;
}

export function buildSnapshotIndexEntry(
  record: DashboardSnapshotRecord,
): DashboardSnapshotIndexEntry {
  return {
    requestKey: record.context.requestKey,
    savedAt: record.savedAt,
    viewId: record.context.viewId,
    firstTabId: record.data.tabs[0]?.id ?? record.data.activeView.id,
    month: record.context.month,
    date: record.context.date,
  };
}

export function isSnapshotIndexUsable(value: unknown): value is DashboardSnapshotIndex {
  if (typeof value !== "object" || value === null) return false;
  const index = value as DashboardSnapshotIndex;
  if (index.v !== SNAPSHOT_INDEX_VERSION || !Array.isArray(index.entries)) return false;
  return index.entries.every(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      typeof entry.requestKey === "string" &&
      typeof entry.savedAt === "number" &&
      typeof entry.viewId === "string" &&
      typeof entry.firstTabId === "string" &&
      typeof entry.month === "string" &&
      typeof entry.date === "string",
  );
}

/**
 * The request key whose stored record should paint a cold open, chosen from the
 * lightweight index exactly like `pickColdPaintRecord` chooses from full
 * records. Returns null when no stored context answers the anchor.
 */
export function pickColdPaintKey(
  index: DashboardSnapshotIndex,
  opts: {
    urlView: string | null;
    urlMonth: string | null;
    urlDate: string | null;
    rememberedMonth: string | null;
  },
): string | null {
  if (index.entries.length === 0) return null;
  const newest = (entries: readonly DashboardSnapshotIndexEntry[]): DashboardSnapshotIndexEntry =>
    entries.reduce((a, b) => (a.savedAt >= b.savedAt ? a : b));
  const anchorMonth =
    opts.urlMonth ?? (opts.urlDate ? opts.urlDate.slice(0, 7) : opts.rememberedMonth);
  const firstTabId = newest(index.entries).firstTabId;
  const pool = opts.urlView
    ? index.entries.filter((entry) => entry.viewId === opts.urlView)
    : index.entries.filter((entry) => entry.firstTabId === firstTabId);
  const candidates = pool.length > 0 ? pool : index.entries;
  if (anchorMonth === null) return newest(candidates).requestKey;
  const anchored = candidates.filter((entry) => entry.month === anchorMonth);
  return anchored.length > 0 ? newest(anchored).requestKey : null;
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
 * the oldest contexts first. Visited tabs plus the active tab's adjacent months
 * accumulate (each record a full snapshot), so without this the map would grow
 * unbounded. The displayed record is held separately, so evicting it here only
 * drops it as a warm *cache* entry, never from the screen.
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
