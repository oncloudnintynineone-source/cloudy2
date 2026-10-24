/**
 * Dashboard navigation — the one module that answers, for the calendar page:
 * given the URL and the held snapshot, which tab and period are displayed, is
 * the held data sufficient, and does this navigation require a fetch?
 *
 * Pure and client-safe. `DashboardScreen` (fetch/presentation) and
 * `DashboardView` (tab taps) are thin adapters over this interface; the
 * low-level request-key, tab-equivalence and period-follows-kind rules live
 * here as internal seams rather than as separately-exported helpers
 * (docs/dashboard-views.md, docs/pwa-offline.md).
 */

import { monthGridMonths, type WeekStart } from "@/lib/events/datetime";
import {
  dashboardRequestKey,
  dashboardTabFiltersEqual,
  isWarmSnapshotFresh,
  requiredMonths,
  type DashboardSnapshotRecord,
} from "@/lib/dashboard/snapshot";
import {
  resolveActiveTab,
  type DashboardViewKind,
  type DashboardViewTab,
} from "@/lib/dashboardViews/views";

// --- internal seams -------------------------------------------------------

/**
 * The fetch signature the current URL asks for, given the last loaded record:
 * the resolved tab id plus the months that tab needs. The day within a month is
 * intentionally absent, so an in-month day move produces the same signature and
 * triggers no fetch. Month precedence mirrors the server: `?date=` wins, then
 * `?month=`, then the held record's context. Returns null before the first
 * record is available (the mount read always runs).
 */
function candidateRequestKey(
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
    months: requiredMonths(tab.kind, month, date, record.data.weekStartsOn),
  });
}

/** Set equality for two month lists (order-insensitive). */
function monthSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((month) => set.has(month));
}

/**
 * The target tab when switching to it can reuse the held record's data: same
 * kind, same required months, and equivalent stored filter overrides. Returns
 * null when the target is unknown, is the held tab, or differs in any
 * data-affecting way.
 */
function equivalentTab(
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
      requiredMonths(target.kind, month, date, record.data.weekStartsOn),
      requiredMonths(
        held.kind,
        record.context.month,
        record.context.date,
        record.data.weekStartsOn,
      ),
    )
  ) {
    return null;
  }
  return target;
}

/**
 * What the held record renders for the current URL: the URL-first tab (so the
 * chrome moves the instant the URL changes, instead of reverting to the held tab
 * while the fetch is in flight), whether the held data already covers the
 * context, and whether the grid should show its skeleton. Falls back to the held
 * tab while a cached record paints, and after a failed fetch (healing an offline
 * navigation back to the loaded tab).
 */
function resolvePresentation(
  record: DashboardSnapshotRecord,
  urlView: string | null,
  urlMonth: string | null,
  urlDate: string | null,
  opts: { cached: boolean; failedKey: string | null },
): { activeView: DashboardViewTab; covered: boolean; isNavigating: boolean } {
  const candidateKey = candidateRequestKey(record, urlView, urlMonth, urlDate);
  const covered =
    (candidateKey !== null && record.context.requestKey === candidateKey) ||
    equivalentTab(record, urlView, urlMonth, urlDate) !== null;
  const fetchFailed = candidateKey !== null && opts.failedKey === candidateKey;
  const isNavigating = !opts.cached && !covered && !fetchFailed;
  const urlTab =
    resolveActiveTab(urlView, record.data.activeView.id, record.data.tabs) ??
    record.data.activeView;
  const activeView = opts.cached || fetchFailed ? record.data.activeView : urlTab;
  return { activeView, covered, isNavigating };
}

/**
 * The URL updates a tab tap applies — the period-follows-kind rule shared by
 * the tap handler and the RSC prefetch, so a prefetched href is exactly the one
 * the tap will push:
 *
 * - Month → Month keeps the shown month; an anchored → Month move carries the
 *   anchor's month (Month has no day anchor of its own);
 * - Month → anchored starts on today;
 * - anchored → a different anchored kind keeps the anchor day;
 * - same kind keeps the current period (just the `?view=` change).
 *
 * Dual Pane is a day-anchored kind too (its Month pane follows the agenda day's
 * month), so it rides the anchored branches unchanged.
 */
function tabSwitchTarget(
  target: Pick<DashboardViewTab, "id" | "kind">,
  context: DashboardSwitchContext,
): Record<string, string | null> {
  const { id, kind } = target;
  if (kind === "month") {
    if (context.view === "month") {
      return { view: id };
    }
    return { view: id, month: context.shownDate.slice(0, 7), date: null };
  }
  if (context.view === "month") {
    return { view: id, date: context.today, month: null };
  }
  if (kind !== context.view) {
    return { view: id, date: context.shownDate, month: null };
  }
  return { view: id };
}

/**
 * Whether tapping a tab must force a server re-read instead of relying on the
 * held record's definition-blind request key (`viewId|months`):
 *
 * - the target id is not in the held `tabs` — a freshly created view (or a
 *   foreign/deep-linked id);
 * - the target is the active tab under a changed kind (edited in place);
 * - `force` — an explicit override from a CRUD navigation.
 *
 * A normal switch between two known tabs is left to the warm-cache path.
 */
function tabSwitchNeedsReload(params: {
  target: Pick<DashboardViewTab, "id" | "kind">;
  activeView: Pick<DashboardViewTab, "id" | "kind">;
  tabs: readonly Pick<DashboardViewTab, "id">[];
  force?: boolean;
}): boolean {
  if (params.force) {
    return true;
  }
  if (!params.tabs.some((tab) => tab.id === params.target.id)) {
    return true;
  }
  return params.target.id === params.activeView.id && params.target.kind !== params.activeView.kind;
}

// --- public interface -----------------------------------------------------

/** The current period/kind a tab switch is resolving from. */
export interface DashboardSwitchContext {
  /** The committed active renderer kind. */
  view: DashboardViewKind;
  /** The currently shown day anchor (ISO `YYYY-MM-DD`). */
  shownDate: string;
  /** Today's date (ISO `YYYY-MM-DD`). */
  today: string;
}

export interface DashboardSwitchPlan {
  /** The `navigate`-style URL updates the tap applies (`null` deletes a param). */
  updates: Record<string, string | null>;
  /** Whether the tap must force a server re-read (definition-blind key). */
  needsReload: boolean;
}

/**
 * The plan for a tab tap: the URL updates (period-follows-kind) and whether the
 * tap must force a re-read. `DashboardView.switchTab` applies the plan — the
 * RSC prefetch uses `updates` alone, so both build the same href.
 */
export function planDashboardSwitch(
  target: Pick<DashboardViewTab, "id" | "kind">,
  context: DashboardSwitchContext,
  reload: {
    activeView: Pick<DashboardViewTab, "id" | "kind">;
    tabs: readonly Pick<DashboardViewTab, "id">[];
    force?: boolean;
  },
): DashboardSwitchPlan {
  return {
    updates: tabSwitchTarget(target, context),
    needsReload: tabSwitchNeedsReload({ target, ...reload }),
  };
}

/**
 * The fetch identity a URL asks for, given the held record: the resolved tab id
 * plus the months that tab needs. Public because `DashboardScreen.fetchFresh`
 * attributes a failed read to the context it attempted — which may be a target
 * URL the navigation hasn't committed yet.
 */
export function candidateKeyForUrl(
  record: DashboardSnapshotRecord | null,
  url: { view: string | null; month: string | null; date: string | null },
): string | null {
  return candidateRequestKey(record, url.view, url.month, url.date);
}

/**
 * Whether the months a held record already read fully cover the Month/Dual grid
 * of `targetMonth`. A month tap may paint the tapped grid straight from the held
 * events only when every month that grid renders is already in hand; a partial
 * overlap would paint the tapped month with empty trailing days that then fill
 * in when the read lands — a silent event pop-in with no skeleton (the grid
 * skeleton is suppressed for the optimistic month paint). Pure and client-safe
 * so the coverage rule is unit-tested alongside the navigation decisions.
 */
export function gridMonthsCovered(
  heldMonth: string,
  targetMonth: string,
  weekStartsOn: WeekStart,
): boolean {
  const held = new Set(monthGridMonths(heldMonth, weekStartsOn));
  return monthGridMonths(targetMonth, weekStartsOn).every((month) => held.has(month));
}

/** The URL + held state a navigation is resolved from. */
export interface DashboardNavigationInput {
  record: DashboardSnapshotRecord | null;
  warmRecords: ReadonlyMap<string, DashboardSnapshotRecord>;
  /** The optimistic tab tap while one is pending, else null. */
  previewView: string | null;
  url: { view: string | null; month: string | null; date: string | null };
  /** A deep link bypasses the warm cache (its target may not be cached). */
  hasDeepLink: boolean;
  /** The candidate key whose fetch last failed (heals back to the held tab). */
  failedKey: string | null;
}

/**
 * What the view renders for the current URL: the record to paint (a warm
 * candidate for this URL, else the held record), the URL-first active tab and
 * period, and whether the held data already covers the context.
 */
export interface DashboardNavigation {
  /** The fetch identity the URL asks for; null before the first record. */
  candidateKey: string | null;
  /** The record to render (a warm candidate for the URL, else the held record). */
  displayRecord: DashboardSnapshotRecord | null;
  /** The tab the chrome and renderer show (undefined only with no record). */
  activeView: DashboardViewTab | undefined;
  /** Whether the held data already answers the URL context. */
  covered: boolean;
  /** Whether the grid should show its skeleton (uncovered, un-failed navigation). */
  isNavigating: boolean;
  /** The displayed period, URL-first. */
  month: string;
  date: string;
}

/**
 * Resolve the displayed navigation for the current URL and held record. Deep
 * links bypass the warm cache; a warm candidate for the URL paints instantly
 * (and is not treated as a navigation), while the URL-first tab moves the chrome
 * the instant the URL changes.
 */
export function resolveDashboardNavigation(input: DashboardNavigationInput): DashboardNavigation {
  const { record, warmRecords, previewView, url, hasDeepLink, failedKey } = input;
  const effectiveView = previewView ?? url.view;
  const candidateKey = candidateRequestKey(record, effectiveView, url.month, url.date);
  if (!record) {
    return {
      candidateKey,
      displayRecord: null,
      activeView: undefined,
      covered: false,
      isNavigating: false,
      month: "",
      date: "",
    };
  }
  const warm = !hasDeepLink && candidateKey ? warmRecords.get(candidateKey) : undefined;
  const displayRecord =
    warm && warm.context.requestKey !== record.context.requestKey ? warm : record;
  const cached = displayRecord !== record;
  const presentation = resolvePresentation(displayRecord, effectiveView, url.month, url.date, {
    // Only a genuinely warm candidate record (a different record than the held
    // one) suppresses the skeleton. A warm context stays visible even if its
    // background read fails — don't heal back to the previous tab.
    cached,
    failedKey: cached ? null : failedKey,
  });

  return {
    candidateKey,
    displayRecord,
    activeView: presentation.activeView,
    covered: presentation.covered,
    isNavigating: presentation.isNavigating,
    month: displayRecord.context.month,
    date: url.date ?? displayRecord.context.date,
  };
}

/**
 * Which cached context a cold open paints. The warm store holds every context
 * the device has ever loaded — including the preload's future-month anchors for
 * the active tab, which are written *newer* than the viewed month — so "the
 * newest record" is usually a month the user never asked for. The paint must
 * answer the anchor the load names: URL `?month`/`?date` win, then the device's
 * remembered month. With an anchor but no cached context for it, paint nothing
 * and let the server read resolve it (the same anchor rule), rather than
 * painting an unrelated — typically future — month and having the revalidation
 * fight the chrome back. With no anchor at all (first-ever load), the newest
 * record for the resolved tab still paints instantly.
 */
export function pickColdPaintRecord(
  cached: readonly DashboardSnapshotRecord[],
  opts: {
    urlView: string | null;
    urlMonth: string | null;
    urlDate: string | null;
    /** The device cookie's remembered dashboard month, if any. */
    rememberedMonth: string | null;
  },
): DashboardSnapshotRecord | null {
  if (cached.length === 0) return null;
  const newest = (records: readonly DashboardSnapshotRecord[]): DashboardSnapshotRecord =>
    records.reduce((a, b) => (a.savedAt >= b.savedAt ? a : b));
  const anchorMonth =
    opts.urlMonth ?? (opts.urlDate ? opts.urlDate.slice(0, 7) : opts.rememberedMonth);

  // A cold load with a silent tab defaults to the first tab in strip order — the
  // last-viewed tab is never resurrected from the device cache.
  const firstTabId = newest(cached).data.tabs[0]?.id ?? null;
  const pool = opts.urlView
    ? cached.filter((entry) => entry.data.activeView.id === opts.urlView)
    : cached.filter((entry) => entry.data.activeView.id === firstTabId);
  const candidates = pool.length > 0 ? pool : cached;

  if (anchorMonth === null) return newest(candidates);
  const anchored = candidates.filter((entry) => entry.context.month === anchorMonth);
  return anchored.length > 0 ? newest(anchored) : null;
}

/**
 * How long an optimistic tab tap may survive while its router transition is
 * still pending but the URL has not caught up. This is only a safety net for a
 * transition that never resolves; the normal revert happens as soon as the
 * transition ends without the URL matching the tapped tab.
 */
export const PREVIEW_STALL_MS = 20_000;

/**
 * Pure revert rule for the optimistic tab preview.
 *
 * Returns null when the preview should stay, or a timeout in milliseconds when
 * it should be cleared. A pending router transition keeps the preview; once the
 * transition is finished and the URL still disagrees, the preview is dropped
 * immediately.
 */
export function previewRevertDelayMs({
  previewView,
  urlView,
  navigationPending,
}: {
  previewView: string | null;
  urlView: string | null;
  navigationPending: boolean;
}): number | null {
  if (previewView === null || urlView === previewView) return null;
  return navigationPending ? PREVIEW_STALL_MS : 0;
}

/**
 * The fetch-decision the URL asks for, given the held record and warm cache:
 * `skip` (covered, warm-fresh, or a pending preview), `swap` (a data-equivalent
 * tab that can be answered by the held record's data without a read — the
 * patched record is returned ready to render), or `fetch`. Pure so the screen's
 * effect is a thin adapter; `now` is injected for the freshness check.
 */
export type DashboardFetchAction =
  | { kind: "skip" }
  | { kind: "swap"; record: DashboardSnapshotRecord; key: string }
  | { kind: "fetch" };

export function classifyDashboardFetch(input: {
  record: DashboardSnapshotRecord | null;
  warmRecords: ReadonlyMap<string, DashboardSnapshotRecord>;
  /** Already preview-effective (`previewView ?? url.view`). */
  url: { view: string | null; month: string | null; date: string | null };
  /** Whether an optimistic tab tap is pending. */
  previewPending: boolean;
  hasFresh: boolean;
  busy: boolean;
  deepLink: boolean;
  now: number;
}): DashboardFetchAction {
  const { record, warmRecords, url, previewPending, hasFresh, busy, deepLink, now } = input;
  const candidateKey = candidateRequestKey(record, url.view, url.month, url.date);
  if (record && candidateKey !== null) {
    if (record.context.requestKey === candidateKey) {
      return { kind: "skip" };
    }
    // A switch to a tab whose data the held record already covers (same kind,
    // required months and filters) needs no server read: swap the tab identity
    // locally. Guarded on fresh, idle data so the swap never races an in-flight
    // read that would otherwise land afterwards and revert the tab.
    if (hasFresh && !busy) {
      const target = equivalentTab(record, url.view, url.month, url.date);
      if (target) {
        const data = { ...record.data, activeView: target };
        const context = { ...record.context, viewId: target.id, requestKey: candidateKey };
        return { kind: "swap", record: { ...record, data, context }, key: candidateKey };
      }
    }
    // A previously loaded context inside the freshness window paints from the
    // warm cache; no read needed. Deep links bypass this so the target event
    // resolves against fresh data.
    const cached = warmRecords.get(candidateKey);
    if (!deepLink && cached && isWarmSnapshotFresh(cached.savedAt, now)) {
      return { kind: "skip" };
    }
  }
  // A previewed (not-yet-committed) tab that isn't warm can't be fetched yet:
  // the fetch input is built from the URL, which still names the previous tab.
  if (previewPending) return { kind: "skip" };
  return { kind: "fetch" };
}
