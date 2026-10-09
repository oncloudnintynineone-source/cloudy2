"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IconCloudOff } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { useReportActivity } from "@/components/ActivityBar";
import { withTimeout } from "@/lib/async";
import { useLoadingIndicator } from "@/lib/loading/loadingIndicator";
import { loadDashboardData, preloadDashboardTabs } from "@/lib/dashboard/actions";
import {
  clearDashboardSnapshots,
  readDashboardSnapshots,
  writeDashboardSnapshot,
  writeDashboardSnapshots,
} from "@/lib/dashboard/localStore";
import {
  DASHBOARD_SNAPSHOT_VERSION,
  assembleDashboardSnapshot,
  capSnapshotMap,
  dashboardRequestKey,
  isRefreshNonceFresh,
  patchSnapshotTab,
  requiredMonths,
  tabLoadStates,
  type DashboardSnapshotRecord,
} from "@/lib/dashboard/snapshot";
import {
  candidateKeyForUrl,
  classifyDashboardFetch,
  resolveDashboardNavigation,
} from "@/lib/dashboard/navigation";
import { isUuid } from "@/lib/uuid";
import { canPreloadTabs } from "@/lib/pwa/warmup";
import type { DashboardViewTab } from "@/lib/dashboardViews/views";
import type { MonthZoom } from "@/lib/ui/monthZoom";
import type { SlotZoom } from "@/lib/ui/slotZoom";

import { DashboardDataProvider, DashboardTabStatusProvider } from "./DashboardDataContext";
import { DashboardView } from "./DashboardView";
import { DashboardShellSkeleton } from "./DashboardShellSkeleton";

interface DashboardScreenProps {
  userId: string;
  initialZoom: SlotZoom;
  /** Week (Grid) column-width zoom, seeded from the device cookie. */
  initialGridWeekColZoom: SlotZoom;
  /** Week (Grid) slot-height zoom, seeded from the device cookie. */
  initialGridWeekRowZoom: SlotZoom;
  /** Week (D) day-column zoom, seeded from the device cookie. */
  initialWeekMatrixZoom: SlotZoom;
  initialMonthZoom: MonthZoom;
  /** Dual Pane Month-pane fraction, seeded from the device cookie. */
  initialDualSplit: number;
}

/**
 * Upper bound on the first-load dashboard read. A cold backend can legitimately
 * take several seconds, but a request that never settles must not leave the
 * full-area skeleton on screen forever — past this the client gives up waiting
 * and (when nothing is cached to fall back on) shows a retryable error instead.
 */
const DASHBOARD_LOAD_TIMEOUT_MS = 20_000;

/**
 * How long an optimistic tab tap survives without the URL catching up. The
 * preview is normally cleared the moment `?view=` matches the tapped tab; if
 * the navigation never lands (offline / stalled push) this bounds how long the
 * displayed view can diverge from the URL, so a later action can't silently
 * snap back to the URL's tab. Mirrors `NAV_TAP_REVERT_MS`.
 */
const PREVIEW_REVERT_MS = 6000;

function inputFromParams(params: URLSearchParams) {
  return {
    view: params.get("view"),
    month: params.get("month"),
    date: params.get("date"),
    edit: params.get("edit"),
    event: params.get("event"),
    eventCal: params.get("_eventCal"),
    refresh: params.get("refresh"),
  };
}

/**
 * The Calendar route's client data layer (docs/pwa-offline.md).
 *
 * On mount it hydrates a per-account map of previously loaded contexts and
 * paints the newest one instantly, then revalidates against the server in the
 * background and swaps the fresh data in place — no skeleton, no remount, no
 * scroll/selection loss. Switching to a context that's already cached paints it
 * immediately (no skeleton) and revalidates only when the cached record is older
 * than `WARM_SNAPSHOT_FRESH_MS`. A mutation clears the cache and re-reads. A
 * failed revalidation keeps the cached render (offline reads keep working).
 */
export function DashboardScreen({
  userId,
  initialZoom,
  initialGridWeekColZoom,
  initialGridWeekRowZoom,
  initialWeekMatrixZoom,
  initialMonthZoom,
  initialDualSplit,
}: DashboardScreenProps) {
  const searchParams = useSearchParams();
  // The latest URL params, read by the fetch without re-triggering it on
  // one-shot param changes (edit/event/refresh are not data-bearing). Synced in
  // an effect declared before the fetch effects, so it updates first.
  const paramsRef = useRef(searchParams);
  useEffect(() => {
    paramsRef.current = searchParams;
  }, [searchParams]);

  const [record, setRecord] = useState<DashboardSnapshotRecord | null>(null);
  // The latest *freshly verified* record, read by the fetch-decision effect
  // without re-triggering it when the record changes (a completed fetch must
  // not schedule another).
  const recordRef = useRef(record);
  useEffect(() => {
    recordRef.current = record;
  }, [record]);

  // Device-local warm contexts, keyed by request key. Hydrated from IndexedDB on
  // mount and updated on every successful read; a revisit paints from here
  // instantly instead of showing the skeleton.
  const [warmRecords, setWarmRecordsRaw] = useState<Map<string, DashboardSnapshotRecord>>(
    () => new Map(),
  );
  // Every write goes through the same LRU cap as the on-disk store so the
  // in-memory map can't grow past the tab count (each record is a full
  // snapshot). See capSnapshotMap.
  const setWarmRecords = useCallback(
    (
      updater:
        | Map<string, DashboardSnapshotRecord>
        | ((prev: Map<string, DashboardSnapshotRecord>) => Map<string, DashboardSnapshotRecord>),
    ) => {
      setWarmRecordsRaw((prev) => capSnapshotMap(typeof updater === "function" ? updater(prev) : updater));
    },
    [],
  );
  const warmRecordsRef = useRef(warmRecords);
  useEffect(() => {
    warmRecordsRef.current = warmRecords;
  }, [warmRecords]);

  // Whether the displayed record came from the device cache or a fresh server
  // read. A cached record is shown through a context-changing revalidation
  // (instant paint, update in place); only once we're on fresh data does a
  // context change read as a navigation and show the grid skeleton.
  const [source, setSource] = useState<"cache" | "fresh">("fresh");
  const [busy, setBusy] = useState(false);
  // Whether a *reported* refresh (post-mutation, view CRUD, inactivity) is in
  // flight. Unlike `busy`, a navigation/filter-apply read does not set it, so
  // the global activity bar covers only refreshes with no in-page skeleton —
  // view loads are carried by the grid skeleton + the active tab's loading bar.
  const [refreshing, setRefreshing] = useState(false);
  // The latest busy flag, read by the fetch-decision effect so an equivalent-tab
  // local swap never races an in-flight read (see the effect below).
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  // The candidate request key whose fetch last failed, so the view can heal back
  // to the held tab on a failed/offline navigation (see the presentation below).
  const [failedContextKey, setFailedContextKey] = useState<string | null>(null);
  // True when a read failed while nothing was cached to fall back on, so the
  // screen shows a retryable error instead of an endless skeleton.
  const [loadFailed, setLoadFailed] = useState(false);
  const requestIdRef = useRef(0);
  const hasFreshRef = useRef(false);
  const lastRefreshRef = useRef<string | null>(null);
  // Tab preload bookkeeping: the anchor signature + generation last scheduled,
  // and a generation counter bumped by any mutation/force refresh so an
  // in-flight preload can't repopulate the warm cache after it was cleared.
  const preloadedRef = useRef<{ signature: string; generation: number } | null>(null);
  const preloadGenerationRef = useRef(0);
  // Background-tab loading indicator (docs/loading-transitions.md §1.13.2):
  // `preloading` is true while a preload pass is in flight; `backgroundKeys` is
  // the set of non-warm tab keys captured when that pass started. The bar is
  // latched to those keys (not recomputed against `warmKeys`) so the min-hold
  // keeps it up after the pass lands and those tabs turn warm.
  const [preloading, setPreloading] = useState(false);
  const [backgroundKeys, setBackgroundKeys] = useState<ReadonlySet<string>>(() => new Set());

  // Optimistic active tab: set on tap (via the data context) so the displayed
  // context can move before the URL navigation commits — a warm tab paints
  // instantly instead of waiting on the RSC round-trip that updates
  // `useSearchParams`. Cleared when the URL catches up (see the sync below), or
  // by a revert timeout if the push never lands.
  const [previewView, setPreviewView] = useState<string | null>(null);

  const view = searchParams.get("view");
  const month = searchParams.get("month");
  const date = searchParams.get("date");

  const editParam = searchParams.get("edit");
  const eventParam = searchParams.get("event");
  const initialEditEventId = editParam && isUuid(editParam) ? editParam : null;
  const initialDetailEventId = eventParam && isUuid(eventParam) ? eventParam : null;
  // A deep link targets a specific event that the cached snapshot may not
  // contain (a different month, a just-created event). Resolve those against
  // fresh data only: skip the warm paint so the event is found when the form /
  // details modal opens.
  const hasDeepLink = initialEditEventId !== null || initialDetailEventId !== null;

  // The dashboard navigation module owns the display/fetch decision (the
  // candidate request key, warm-record choice, URL-first tab, coverage/skeleton).
  // The screen is a thin adapter over it (src/lib/dashboard/navigation.ts).
  const navigation = useMemo(
    () =>
      resolveDashboardNavigation({
        record,
        warmRecords,
        previewView,
        url: { view, month, date },
        hasDeepLink,
        failedKey: failedContextKey,
      }),
    [record, warmRecords, previewView, view, month, date, hasDeepLink, failedContextKey],
  );
  const candidateKey = navigation.candidateKey;
  const isNavigating = navigation.isNavigating;
  const urlKey = `${view ?? ""}|${month ?? ""}|${date ?? ""}`;
  const refreshParam = searchParams.get("refresh");

  // Once the URL catches up to the optimistic tap the preview has served its
  // purpose — drop it so the URL is authoritative again (render-phase "adjust
  // state during render", the codebase's derived-state pattern).
  if (previewView !== null && view === previewView) {
    setPreviewView(null);
  }
  // Revert window: a tap whose navigation never lands must not strand the
  // displayed view away from the URL, or a later action (which builds its href
  // from `searchParams`) would snap back to the URL's tab.
  useEffect(() => {
    if (previewView === null) return;
    const timer = window.setTimeout(() => setPreviewView(null), PREVIEW_REVERT_MS);
    return () => window.clearTimeout(timer);
  }, [previewView]);

  useReportActivity(refreshing, "dashboard:refresh");

  const fetchFresh = useCallback(async (overrideParams?: URLSearchParams) => {
    const requestId = ++requestIdRef.current;
    // Yield first: an effect must not call setState synchronously, and this
    // fetch is always kicked off from an effect or an event handler.
    await Promise.resolve();
    setBusy(true);
    // The params this read answers: normally the committed URL, but a
    // definition change (a view's kind edited in place) passes the target URL
    // the navigation is about to push, so the fetch carries the new period
    // instead of racing the not-yet-committed address.
    const params = overrideParams ?? paramsRef.current;
    // The context this read answers, so a failure is attributed to it (and only
    // it) for the presentation's heal-back to the held tab.
    const attemptedKey = candidateKeyForUrl(recordRef.current, {
      view: params.get("view"),
      month: params.get("month"),
      date: params.get("date"),
    });
    try {
      const result = await withTimeout(
        loadDashboardData(inputFromParams(params)),
        DASHBOARD_LOAD_TIMEOUT_MS,
      );
      if (requestId !== requestIdRef.current) return;
      if (result.ok) {
        hasFreshRef.current = true;
        setSource("fresh");
        setFailedContextKey(null);
        setLoadFailed(false);
        setRecord(result.record);
        setWarmRecords((current) => {
          const next = new Map(current);
          next.set(result.record.context.requestKey, result.record);
          return next;
        });
        void writeDashboardSnapshot(userId, result.record.data, result.record.context);
      } else {
        setFailedContextKey(attemptedKey);
        if (recordRef.current === null) setLoadFailed(true);
      }
      // A failed read keeps the cached snapshot on screen (offline reads work);
      // the OfflineBanner is the user-facing signal.
    } catch {
      // Network/session failures: keep the cached render.
      if (requestId === requestIdRef.current) {
        setFailedContextKey(attemptedKey);
        if (recordRef.current === null) setLoadFailed(true);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setBusy(false);
      }
    }
  }, [userId, setWarmRecords]);

  // Retry the first read after the retryable error screen (no cached data to
  // fall back on). Clearing the flag flips the screen back to the skeleton.
  const retryInitialLoad = useCallback(() => {
    setLoadFailed(false);
    void fetchFresh();
  }, [fetchFresh]);

  // Background-preload every tab for the current anchor (docs/pwa-offline.md
  // §1.18), so a tab switch paints from the warm cache with no round-trip. The
  // result is discarded if a mutation/force refresh bumped the generation or a
  // newer anchor superseded the signature.
  const preloadTabs = useCallback(
    async (signature: string, generation: number) => {
      const current = recordRef.current;
      if (current) {
        // Snapshot the tabs this pass must actually load (not already warm for
        // the anchor), so the background bar latches to them.
        const warm = warmRecordsRef.current;
        setBackgroundKeys(
          new Set(
            current.data.tabs
              .map((tab) =>
                dashboardRequestKey({
                  viewId: tab.id,
                  months: requiredMonths(tab.kind, current.context.month, current.context.date),
                }),
              )
              .filter((key) => !warm.has(key)),
          ),
        );
      }
      setPreloading(true);
      try {
        const result = await preloadDashboardTabs(inputFromParams(paramsRef.current));
        if (preloadGenerationRef.current !== generation) return;
        if (preloadedRef.current?.signature !== signature) return;
        if (!result.ok) return;
        const records: DashboardSnapshotRecord[] = result.tabs.map((tab) => ({
          version: DASHBOARD_SNAPSHOT_VERSION,
          savedAt: Date.now(),
          context: tab.context,
          data: assembleDashboardSnapshot(result.shared, tab.delta),
        }));
        setWarmRecords((current) => {
          const next = new Map(current);
          for (const record of records) {
            next.set(record.context.requestKey, record);
          }
          return next;
        });
        // One transaction + one prune for the whole batch (not one per tab).
        void writeDashboardSnapshots(
          userId,
          records.map((record) => ({ data: record.data, context: record.context })),
        );
      } finally {
        // Only the run that is still current may drop the flag; a superseded or
        // revalidate-bumped run leaves it to its successor.
        if (
          preloadGenerationRef.current === generation &&
          preloadedRef.current?.signature === signature
        ) {
          setPreloading(false);
        }
      }
    },
    [userId, setWarmRecords],
  );

  // Hydrate the warm cache and paint a stored context as soon as it is read: the
  // first tab's when the URL is silent (never the last-viewed tab), else the
  // newest. A fresh server response always wins if it lands first. A force-refresh
  // reload clears the cache instead of painting it.
  useEffect(() => {
    let alive = true;
    void readDashboardSnapshots(userId).then((cached) => {
      if (!alive) return;
      if (isRefreshNonceFresh(paramsRef.current.get("refresh"), Date.now())) {
        void clearDashboardSnapshots(userId);
        return;
      }
      if (cached.length > 0) {
        // Overlay the hydrated records under any already-fetched ones, so a read
        // that landed before hydration isn't clobbered by an older stored copy.
        setWarmRecords((current) => {
          const next = new Map(cached.map((entry) => [entry.context.requestKey, entry]));
          for (const [key, value] of current) {
            next.set(key, value);
          }
          return next;
        });
      }
      if (hasFreshRef.current || cached.length === 0) return;
      const latest = cached.reduce((a, b) => (a.savedAt >= b.savedAt ? a : b));
      // Cold load with a silent URL defaults to the first tab, so the
      // last-viewed tab is never resurrected from the device cache. With
      // `?view=` the URL resolves the tab, so any record can hold the paint.
      const urlView = paramsRef.current.get("view");
      const firstTabId = latest.data.tabs[0]?.id ?? null;
      const paint =
        urlView || !firstTabId
          ? latest
          : cached
              .filter((entry) => entry.data.activeView.id === firstTabId)
              .reduce<DashboardSnapshotRecord | null>(
                (a, b) => (a === null || a.savedAt <= b.savedAt ? b : a),
                null,
              );
      // No cached context for the first tab: leave `record` empty so the fetch
      // reads it from the server (which also defaults to the first tab).
      if (!paint) return;
      setSource("cache");
      setRecord(paint);
    });
    return () => {
      alive = false;
    };
  }, [userId, setWarmRecords]);

  // Fetch only when the URL asks for data the held record doesn't already
  // cover (mount, tab switch, month-set change) — never for an in-month day
  // move. A previously loaded context within the freshness window is served
  // from the warm cache without a read. A fresh `?refresh=` nonce is handled
  // separately so it also forces a read when only the nonce changed.
  useEffect(() => {
    if (isRefreshNonceFresh(paramsRef.current.get("refresh"), Date.now())) return;
    const action = classifyDashboardFetch({
      record: recordRef.current,
      warmRecords: warmRecordsRef.current,
      // The optimistic tap drives the decision too, so a not-yet-warm tab
      // fetches immediately on tap instead of waiting for the URL to commit.
      url: {
        view: previewView ?? paramsRef.current.get("view"),
        month: paramsRef.current.get("month"),
        date: paramsRef.current.get("date"),
      },
      previewPending: previewView !== null,
      hasFresh: hasFreshRef.current,
      busy: busyRef.current,
      deepLink:
        isUuid(paramsRef.current.get("edit") ?? "") || isUuid(paramsRef.current.get("event") ?? ""),
      now: Date.now(),
    });
    if (action.kind === "skip") return;
    if (action.kind === "swap") {
      const patched = action.record;
      // Yield first: an effect must not call setState synchronously (same
      // pattern as `fetchFresh`).
      void Promise.resolve().then(() => {
        setRecord(patched);
        setWarmRecords((map) => {
          const next = new Map(map);
          next.set(action.key, patched);
          return next;
        });
        void writeDashboardSnapshot(userId, patched.data, patched.context);
      });
      return;
    }
    void fetchFresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey, previewView]);

  // A fresh `?refresh=` nonce (header Force refresh reload, or the inactivity
  // refresh's soft navigation) forces a read even though the data key is
  // unchanged. It also drops the warm cache so the read can't be shadowed.
  useEffect(() => {
    if (!refreshParam || lastRefreshRef.current === refreshParam) return;
    lastRefreshRef.current = refreshParam;
    if (isRefreshNonceFresh(refreshParam, Date.now())) {
      // Yield first: an effect must not call setState synchronously (same
      // pattern as `fetchFresh`).
      void Promise.resolve().then(() => {
        preloadGenerationRef.current += 1;
        preloadedRef.current = null;
        setWarmRecords(new Map());
        void clearDashboardSnapshots(userId);
        void fetchFresh();
      });
    }
  }, [refreshParam, fetchFresh, userId, setWarmRecords]);

  // Preload every tab once the active context is fresh and idle, so switching
  // tabs paints instantly. Runs once per anchor signature (tab set + the months
  // those tabs need), deferred to idle so it never delays first paint, and
  // skipped offline. Also skipped on weak devices / constrained connections —
  // it costs a server read plus a write per tab, and the active tab is always
  // loaded, so a skipped preload only means a later tab fetches on demand.
  useEffect(() => {
    if (!record || source !== "fresh" || busy) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (!canPreloadTabs()) return;
    const tabs = record.data.tabs;
    // Nothing to warm with a single tab: the active read already covers it, so
    // skip the second server config pass entirely.
    if (tabs.length <= 1) return;
    const months = [
      ...new Set(
        tabs.flatMap((tab) => requiredMonths(tab.kind, record.context.month, record.context.date)),
      ),
    ].sort();
    const signature = `${tabs.map((tab) => tab.id).join(",")}|${months.join(",")}`;
    const generation = preloadGenerationRef.current;
    if (
      preloadedRef.current?.signature === signature &&
      preloadedRef.current.generation === generation
    ) {
      return;
    }
    const run = () => {
      if (preloadGenerationRef.current !== generation) return;
      preloadedRef.current = { signature, generation };
      void preloadTabs(signature, generation);
    };
    const handle =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback(run, { timeout: 2000 })
        : window.setTimeout(run, 0);
    return () => {
      if (typeof cancelIdleCallback === "function") {
        cancelIdleCallback(handle);
      } else {
        window.clearTimeout(handle);
      }
    };
  }, [record, source, busy, preloadTabs]);

  // Post-mutation / filter-change refresh: drop every cached context (the write
  // may affect any of them), then re-read the current one. `report: false`
  // (filter apply) skips the global activity bar — that read is a view load,
  // carried by the active tab's loading bar instead. An
  // optional `params` override carries the target URL for a definition change
  // whose navigation hasn't committed yet (see `switchTab`).
  const revalidate = useCallback(
    (options?: { report?: boolean; params?: URLSearchParams }) => {
      preloadGenerationRef.current += 1;
      preloadedRef.current = null;
      setWarmRecords(new Map());
      const report = options?.report !== false;
      if (report) setRefreshing(true);
      void (async () => {
        try {
          await clearDashboardSnapshots(userId);
          await fetchFresh(options?.params);
        } finally {
          if (report) setRefreshing(false);
        }
      })();
    },
    [fetchFresh, userId, setWarmRecords],
  );

  // Optimistic View edit (rename / kind change from Manage views): patch the
  // held snapshot's tab definition in place so the strip and the manage list
  // repaint immediately, then the caller's `revalidate()` reconciles against the
  // server. A no-op for a tab the held record doesn't know.
  const applyViewTab = useCallback(
    (tab: DashboardViewTab) => {
      const current = recordRef.current;
      if (!current) return;
      const patched = patchSnapshotTab(current, tab);
      if (patched === current) return;
      setRecord(patched);
      void writeDashboardSnapshot(userId, patched.data, patched.context);
    },
    [userId],
  );

  // Per-tab loading bars (docs/loading-transitions.md §1.13.2). The active
  // tab's own read shows immediately and lingers 1s; a background preload waits
  // 300ms before appearing (a fast warm pass never flashes it) and also holds
  // 1s once shown. Both ride `tabStatus`, so the tab strip paints a bar per tab.
  const activeLoading = useLoadingIndicator(busy, { delayMs: 0, minHoldMs: 1000 });
  const backgroundLoading = useLoadingIndicator(preloading, { delayMs: 300, minHoldMs: 1000 });

  // Per-tab status for the tab strip (docs/loading-transitions.md §1.13.2):
  // fresh (solid) / loading (a sweeping amber bar) / not-loaded (static fade).
  // The active tab is always treated as fresh unless a read for it is in flight.
  const tabStatus = useMemo(() => {
    if (!record) return {};
    const tabs = record.data.tabs;
    const activeId = navigation.activeView?.id ?? null;
    const keyForTab = (tab: (typeof tabs)[number]) =>
      dashboardRequestKey({
        viewId: tab.id,
        months: requiredMonths(tab.kind, record.context.month, record.context.date),
      });

    // Warm keys from the map (the current record's key included): a warm copy of
    // any age paints the tab solid; a stale one revalidates silently on tap.
    const warmKeys = new Set<string>(warmRecords.keys());
    warmKeys.add(record.context.requestKey);

    // A read for the active tab's context (nav / filter / revalidate) lights its
    // bar. Keyed on the held record's anchor (the helper's basis), so a
    // cross-month read still flags the active tab.
    const loadingKeys = new Set<string>();
    if (activeLoading) {
      const activeTab = tabs.find((tab) => tab.id === activeId) ?? record.data.activeView;
      loadingKeys.add(keyForTab(activeTab));
    }
    // A preload pass lights every tab it still has to load (latched at pass
    // start, so the 1s hold survives those tabs turning warm).
    if (backgroundLoading) {
      for (const key of backgroundKeys) loadingKeys.add(key);
    }

    return tabLoadStates({
      tabs,
      month: record.context.month,
      date: record.context.date,
      warmKeys,
      loadingKeys,
      activeTabId: activeId,
    });
  }, [record, warmRecords, activeLoading, backgroundLoading, backgroundKeys, navigation]);

  const context = useMemo(
    () => ({
      revalidate,
      // Coverage-based, not tied to the router transition or `busy`: it stays
      // true from the instant the URL context changes until the held data
      // answers it (or the fetch fails), so the grid skeleton can't flash or gap
      // around the data fetch.
      isNavigating,
      setPreviewView,
      applyViewTab,
    }),
    [revalidate, isNavigating, setPreviewView, applyViewTab],
  );

  // `_eventCal`/`event` are deliberately absent from the request key, so a deep
  // link whose tab/month set is unchanged triggers no fetch. When the record is
  // already for the current context but lacks the target, resolve it once (the
  // server reads the target separately from the grid); the attempted-id ref
  // prevents a loop when the event no longer exists.
  const deepLinkId = initialEditEventId ?? initialDetailEventId;
  const attemptedDeepLinkRef = useRef<string | null>(null);
  // The deep link whose one-shot resolution read has finished (success or not).
  // `DashboardView` opens the details modal as a skeleton immediately; this is
  // what lets it stop waiting and raise the "not in your current view" advisory
  // when the read settles with no target. State (not a ref) so the render value
  // updates once the read lands.
  const [settledDeepLinkId, setSettledDeepLinkId] = useState<string | null>(null);
  useEffect(() => {
    if (!deepLinkId) {
      attemptedDeepLinkRef.current = null;
      // Deferred: an effect must not call setState synchronously (same pattern
      // as `fetchFresh`).
      void Promise.resolve().then(() => setSettledDeepLinkId(null));
      return;
    }
    if (attemptedDeepLinkRef.current === deepLinkId) return;
    // Only a link arriving after we already hold fresh data needs the extra
    // read; a context-changing link is covered by the normal revalidation (which
    // carries `_eventCal`).
    if (!hasFreshRef.current || !record) return;
    attemptedDeepLinkRef.current = deepLinkId;
    const heldIsCandidate = record.context.requestKey === candidateKey;
    const inEvents =
      heldIsCandidate && record.data.events.some((event) => event.payload.eventId === deepLinkId);
    const inDeepLink = heldIsCandidate && record.deepLinkEvent?.payload.eventId === deepLinkId;
    if (heldIsCandidate && (inEvents || inDeepLink)) {
      // Already held fresh and carrying the target: nothing to fetch, settled.
      void Promise.resolve().then(() => setSettledDeepLinkId(deepLinkId));
      return;
    }
    // `fetchFresh` defers its setState to a microtask (see its own comment); the
    // `settled` flag lands even later, after the read resolves — never
    // synchronously in this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchFresh().finally(() => {
      if (attemptedDeepLinkRef.current === deepLinkId) {
        setSettledDeepLinkId(deepLinkId);
      }
    });
  }, [deepLinkId, record, candidateKey, fetchFresh]);

  // Whether the held record currently carries the deep link's target (its grid
  // or the server's separate resolution) — the success half of the resolution.
  const deepLinkResolved =
    deepLinkId !== null &&
    record !== null &&
    record.context.requestKey === candidateKey &&
    (record.data.events.some((event) => event.payload.eventId === deepLinkId) ||
      record.deepLinkEvent?.payload.eventId === deepLinkId);
  // Whether the deep link has settled: resolved, or its read finished without a
  // match. `DashboardView` holds the skeleton until this is false-and-missing.
  const deepLinkSettled =
    deepLinkId !== null && (deepLinkResolved || settledDeepLinkId === deepLinkId);

  if (!record) {
    // Nothing cached to paint: a failed/timed-out first read gets a retryable
    // error instead of an endless skeleton.
    if (loadFailed) {
      return (
        <EmptyState
          icon={<IconCloudOff size={22} />}
          description="Couldn't load the calendar. Check your connection and try again."
          actionLabel="Retry"
          onAction={retryInitialLoad}
        />
      );
    }
    return <DashboardShellSkeleton />;
  }

  const shown = navigation.displayRecord ?? record;

  return (
    <DashboardDataProvider value={context}>
      <DashboardTabStatusProvider value={tabStatus}>
        <DashboardView
          {...shown.data}
          activeView={navigation.activeView ?? shown.data.activeView}
          month={navigation.month}
          date={navigation.date}
          initialZoom={initialZoom}
          initialGridWeekColZoom={initialGridWeekColZoom}
          initialGridWeekRowZoom={initialGridWeekRowZoom}
          initialWeekMatrixZoom={initialWeekMatrixZoom}
          initialMonthZoom={initialMonthZoom}
          initialDualSplit={initialDualSplit}
          initialEditEventId={initialEditEventId}
          initialDetailEventId={initialDetailEventId}
          deepLinkEvent={shown.deepLinkEvent ?? null}
          deepLinkSettled={deepLinkSettled}
        />
      </DashboardTabStatusProvider>
    </DashboardDataProvider>
  );
}
