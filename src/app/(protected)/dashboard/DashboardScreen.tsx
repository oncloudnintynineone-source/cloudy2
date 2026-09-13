"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IconCloudOff } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { useReportActivity } from "@/components/ActivityBar";
import { withTimeout } from "@/lib/async";
import { loadDashboardData, preloadDashboardTabs } from "@/lib/dashboard/actions";
import {
  clearDashboardSnapshots,
  readDashboardSnapshots,
  writeDashboardSnapshot,
} from "@/lib/dashboard/localStore";
import {
  DASHBOARD_SNAPSHOT_VERSION,
  assembleDashboardSnapshot,
  dashboardCandidateRequestKey,
  dashboardRequestKey,
  equivalentDashboardTab,
  isRefreshNonceFresh,
  isWarmSnapshotFresh,
  requiredMonths,
  resolveDashboardPresentation,
  tabLoadStates,
  type DashboardSnapshotRecord,
} from "@/lib/dashboard/snapshot";
import { isUuid } from "@/lib/uuid";
import type { MonthZoom } from "@/lib/ui/monthZoom";
import type { SlotZoom } from "@/lib/ui/slotZoom";

import { DashboardDataProvider } from "./DashboardDataContext";
import { DashboardView } from "./DashboardView";
import { DashboardShellSkeleton } from "./DashboardShellSkeleton";

interface DashboardScreenProps {
  userId: string;
  initialZoom: SlotZoom;
  initialMonthZoom: MonthZoom;
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
  initialMonthZoom,
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
  const [warmRecords, setWarmRecords] = useState<Map<string, DashboardSnapshotRecord>>(
    () => new Map(),
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
  // Whether the background tab preload (the single union read that warms every
  // tab) is in flight. Feeds the tab strip's per-tab load state: while it runs,
  // every not-yet-loaded tab is "loading" (faded + breathing).
  const [preloadBusy, setPreloadBusy] = useState(false);
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

  // Optimistic active tab: set on tap (via the data context) so the displayed
  // context can move before the URL navigation commits — a warm tab paints
  // instantly instead of waiting on the RSC round-trip that updates
  // `useSearchParams`. Cleared when the URL catches up (see the sync below), or
  // by a revert timeout if the push never lands.
  const [previewView, setPreviewView] = useState<string | null>(null);

  const view = searchParams.get("view");
  const month = searchParams.get("month");
  const date = searchParams.get("date");

  // The tab the data layer resolves from: the optimistic tap while one is
  // pending, else the URL. Everything data-bearing (candidate key, presentation,
  // fetch decision) reads this, so the switch no longer waits for the URL.
  const effectiveView = previewView ?? view;

  const editParam = searchParams.get("edit");
  const eventParam = searchParams.get("event");
  const initialEditEventId = editParam && isUuid(editParam) ? editParam : null;
  const initialDetailEventId = eventParam && isUuid(eventParam) ? eventParam : null;
  // A deep link targets a specific event that the cached snapshot may not
  // contain (a different month, a just-created event). Resolve those against
  // fresh data only: skip the warm paint so the event is found when the form /
  // details modal opens.
  const hasDeepLink = initialEditEventId !== null || initialDetailEventId !== null;

  // The data identity the current URL asks for (tab + required months). It does
  // not change for an in-month day move, so such a move never fetches. `urlKey`
  // is the raw URL fingerprint that re-runs the fetch-decision effect below.
  const candidateKey = useMemo(
    () => dashboardCandidateRequestKey(record, effectiveView, month, date),
    [record, effectiveView, month, date],
  );

  // The record the view renders: a warm cached context for this URL paints
  // instantly (while the background revalidation runs), otherwise the last
  // freshly verified record. Deep links deliberately bypass the warm cache.
  const warm = !hasDeepLink && candidateKey ? warmRecords.get(candidateKey) : undefined;
  const displayRecord =
    warm && record && warm.context.requestKey !== record.context.requestKey ? warm : record;

  // What the view renders for this URL: the URL-first tab (so the chrome moves
  // the instant the URL changes instead of reverting to the held tab while the
  // fetch is in flight), and whether the held data already covers the context.
  const presentation = useMemo(
    () =>
      displayRecord
        ? resolveDashboardPresentation(displayRecord, effectiveView, month, date, {
            // Only a genuinely warm candidate record (a different record than the
            // held one) suppresses the skeleton. When the destination isn't warm
            // this is a real navigation even while a device-cached record is on
            // screen (`source === "cache"`), so it must read as `isNavigating` —
            // otherwise the previous context's grid lingers until the read lands.
            cached: displayRecord !== record,
            // A warm context stays visible even if its background read fails —
            // don't heal back to the previous tab.
            failedKey: displayRecord !== record ? null : failedContextKey,
          })
        : null,
    [displayRecord, record, effectiveView, month, date, failedContextKey],
  );
  const isNavigating = presentation?.isNavigating ?? false;
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

  useReportActivity(busy, "dashboard:revalidate");

  const fetchFresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    // Yield first: an effect must not call setState synchronously, and this
    // fetch is always kicked off from an effect or an event handler.
    await Promise.resolve();
    setBusy(true);
    // The context this read answers, so a failure is attributed to it (and only
    // it) for the presentation's heal-back to the held tab.
    const attemptedKey = dashboardCandidateRequestKey(
      recordRef.current,
      paramsRef.current.get("view"),
      paramsRef.current.get("month"),
      paramsRef.current.get("date"),
    );
    try {
      const result = await withTimeout(
        loadDashboardData(inputFromParams(paramsRef.current)),
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
  }, [userId]);

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
      setPreloadBusy(true);
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
        for (const record of records) {
          void writeDashboardSnapshot(userId, record.data, record.context);
        }
      } finally {
        setPreloadBusy(false);
      }
    },
    [userId],
  );

  // Hydrate the warm cache and paint the newest stored context as soon as it is
  // read. A fresh server response always wins if it lands first. A force-refresh
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
      setSource("cache");
      setRecord(latest);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  // Fetch only when the URL asks for data the held record doesn't already
  // cover (mount, tab switch, month-set change) — never for an in-month day
  // move. A previously loaded context within the freshness window is served
  // from the warm cache without a read. A fresh `?refresh=` nonce is handled
  // separately so it also forces a read when only the nonce changed.
  useEffect(() => {
    if (isRefreshNonceFresh(paramsRef.current.get("refresh"), Date.now())) return;
    const current = recordRef.current;
    // The optimistic tap drives the decision too, so a not-yet-warm tab fetches
    // immediately on tap instead of waiting for the URL to commit.
    const urlView = previewView ?? paramsRef.current.get("view");
    const urlMonth = paramsRef.current.get("month");
    const urlDate = paramsRef.current.get("date");
    const candidate = dashboardCandidateRequestKey(current, urlView, urlMonth, urlDate);
    if (current && candidate !== null) {
      if (current.context.requestKey === candidate) {
        return;
      }
      // A switch to a tab whose data the held record already covers (same kind,
      // required months and filters) needs no server read: swap the tab identity
      // locally. Guarded on fresh, idle data so the swap never races an
      // in-flight read that would otherwise land afterwards and revert the tab.
      if (hasFreshRef.current && !busyRef.current) {
        const target = equivalentDashboardTab(current, urlView, urlMonth, urlDate);
        if (target) {
          const data = { ...current.data, activeView: target };
          const context = { ...current.context, viewId: target.id, requestKey: candidate };
          const patched = { ...current, data, context };
          // Yield first: an effect must not call setState synchronously (same
          // pattern as `fetchFresh`).
          void Promise.resolve().then(() => {
            setRecord(patched);
            setWarmRecords((map) => {
              const next = new Map(map);
              next.set(candidate, patched);
              return next;
            });
            void writeDashboardSnapshot(userId, data, context);
          });
          return;
        }
      }
      // A previously loaded context inside the freshness window paints from the
      // warm cache; no read needed. Deep links bypass this so the target event
      // resolves against fresh data.
      const deepLinkParam =
        isUuid(paramsRef.current.get("edit") ?? "") ||
        isUuid(paramsRef.current.get("event") ?? "");
      const cached = warmRecordsRef.current.get(candidate);
      if (!deepLinkParam && cached && isWarmSnapshotFresh(cached.savedAt, Date.now())) {
        return;
      }
    }
    // A previewed (not-yet-committed) tab that isn't warm can't be fetched yet:
    // the fetch input is built from the URL, which still names the previous tab
    // (and its period rule). The URL-driven run after the push commits fetches it.
    if (previewView !== null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  }, [refreshParam, fetchFresh, userId]);

  // Preload every tab once the active context is fresh and idle, so switching
  // tabs paints instantly. Runs once per anchor signature (tab set + the months
  // those tabs need), deferred to idle so it never delays first paint, and
  // skipped offline.
  useEffect(() => {
    if (!record || source !== "fresh" || busy) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const tabs = record.data.tabs;
    // Nothing to warm with a single tab: the active read already covers it, so
    // skip the second server config pass entirely.
    if (tabs.length <= 1) return;
    const months = [
      ...new Set(
        tabs.flatMap((tab) =>
          requiredMonths(tab.kind, record.context.month, record.context.date),
        ),
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
  // may affect any of them), then re-read the current one.
  const revalidate = useCallback(() => {
    preloadGenerationRef.current += 1;
    preloadedRef.current = null;
    setWarmRecords(new Map());
    void (async () => {
      await clearDashboardSnapshots(userId);
      await fetchFresh();
    })();
  }, [fetchFresh, userId]);

  // Per-tab load state for the tab strip. A tab is "loaded" when a warm
  // snapshot for its current request key exists (paintable instantly, any age),
  // "loading" while a fetch for that key is in flight (the background preload,
  // or the active/on-tap priority read), and "not-loaded" otherwise.
  const tabStatus = useMemo(() => {
    if (!record) return {};
    const tabs = record.data.tabs;
    const loadedKeys = new Set(warmRecords.keys());
    loadedKeys.add(record.context.requestKey);
    const loadingKeys = new Set<string>();
    if (preloadBusy) {
      for (const tab of tabs) {
        loadingKeys.add(
          dashboardRequestKey({
            viewId: tab.id,
            months: requiredMonths(tab.kind, record.context.month, record.context.date),
          }),
        );
      }
    }
    if (busy) {
      const activeKey = dashboardCandidateRequestKey(
        record,
        effectiveView,
        searchParams.get("month"),
        searchParams.get("date"),
      );
      if (activeKey) loadingKeys.add(activeKey);
    }
    return tabLoadStates({
      tabs,
      month: record.context.month,
      date: record.context.date,
      loadedKeys,
      loadingKeys,
    });
  }, [record, warmRecords, preloadBusy, busy, effectiveView, searchParams]);

  const context = useMemo(
    () => ({
      revalidate,
      isRevalidating: busy,
      // Coverage-based, not tied to the router transition or `busy`: it stays
      // true from the instant the URL context changes until the held data
      // answers it (or the fetch fails), so the grid skeleton can't flash or gap
      // around the data fetch.
      isNavigating,
      tabStatus,
      previewView,
      setPreviewView,
    }),
    [revalidate, busy, isNavigating, tabStatus, previewView],
  );

  // `_eventCal`/`event` are deliberately absent from the request key, so a deep
  // link whose tab/month set is unchanged triggers no fetch. When the record is
  // already for the current context but lacks the target, resolve it once (the
  // server reads the target separately from the grid); the attempted-id ref
  // prevents a loop when the event no longer exists.
  const deepLinkId = initialEditEventId ?? initialDetailEventId;
  const attemptedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLinkId) {
      attemptedDeepLinkRef.current = null;
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
    // `fetchFresh` defers its setState to a microtask (see its own comment), so
    // this is not a synchronous state update.
    if (!heldIsCandidate || (!inEvents && !inDeepLink)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchFresh();
    }
  }, [deepLinkId, record, candidateKey, fetchFresh]);

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
  if (hasDeepLink && source === "cache") {
    return <DashboardShellSkeleton />;
  }

  const shown = displayRecord ?? record;
  // The day the view renders. The URL wins when it pins one: an in-month move
  // never fetches, so the held context would otherwise stay on the last read's
  // day and the Day/Week (H) grids, chrome and back/forward would not move.
  const effectiveDate = date ?? shown.context.date;

  return (
    <DashboardDataProvider value={context}>
      <DashboardView
        {...shown.data}
        activeView={presentation?.activeView ?? shown.data.activeView}
        month={shown.context.month}
        date={effectiveDate}
        initialZoom={initialZoom}
        initialMonthZoom={initialMonthZoom}
        initialEditEventId={initialEditEventId}
        initialDetailEventId={initialDetailEventId}
        deepLinkEvent={shown.deepLinkEvent ?? null}
      />
    </DashboardDataProvider>
  );
}
