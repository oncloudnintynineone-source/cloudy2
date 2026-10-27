"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconCloudOff } from "@tabler/icons-react";

import { EmptyState } from "@/components/EmptyState";
import { useReportActivity } from "@/components/ActivityBar";
import { withTimeout } from "@/lib/async";
import { ApiError, isAbortError, isUnauthorized, postJson } from "@/lib/api/client";
import { isColdLaunchActive } from "@/lib/loading/coldLaunch";
import { useLoadingIndicator } from "@/lib/loading/loadingIndicator";
import type { LoadDashboardDataResult, PreloadDashboardTabsResult } from "@/lib/dashboard/actions";
import type { CalendarEvent } from "@/lib/events/queries";
import {
  clearDashboardSnapshots,
  readDashboardSnapshot,
  readDashboardSnapshotIndex,
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
  pickColdPaintKey,
  requiredMonths,
  tabLoadStates,
  type DashboardSnapshotRecord,
} from "@/lib/dashboard/snapshot";
import {
  candidateKeyForUrl,
  classifyDashboardFetch,
  pickColdPaintRecord,
  previewRevertDelayMs,
  resolveDashboardNavigation,
} from "@/lib/dashboard/navigation";
import { isUuid } from "@/lib/uuid";
import { dashboardBootSignature } from "@/lib/dashboard/prefetch";
import { takeDashboardBoot } from "@/lib/dashboard/boot";
import { mark } from "@/lib/perf/marks";
import { canPreloadTabs, canWarmRoutes } from "@/lib/pwa/warmup";
import type { DashboardViewTab } from "@/lib/dashboardViews/views";
import type { MonthZoom } from "@/lib/ui/monthZoom";
import type { SlotZoom } from "@/lib/ui/slotZoom";

import { DashboardDataProvider, DashboardTabStatusProvider } from "./DashboardDataContext";
import { DashboardView } from "./DashboardView";
import { DashboardShellSkeleton } from "./DashboardShellSkeleton";
import { preloadRendererKind, readLastRendererKind, rememberRendererKind } from "./rendererPreload";

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
  /** The device cookie's remembered anchor month, used to pick the cold paint. */
  initialMonth: string | null;
}

/**
 * Upper bound on the first-load dashboard read. A cold backend can legitimately
 * take several seconds, but a request that never settles must not leave the
 * full-area skeleton on screen forever — past this the client gives up waiting
 * and (when nothing is cached to fall back on) shows a retryable error instead.
 */
const DASHBOARD_LOAD_TIMEOUT_MS = 20_000;

/**
 * Fold a burst of context changes (a held month chevron, a rapid tab + date
 * step) into one read. The read itself is abortable, but only the last tap's
 * context should ever reach the server.
 */
const CONTEXT_FETCH_DEBOUNCE_MS = 120;

/** The lean deep-link target read's response. */
type DeepLinkResult = { ok: true; event: CalendarEvent | null } | { ok: false; error: string };

function inputFromParams(params: URLSearchParams) {
  return {
    view: params.get("view"),
    month: params.get("month"),
    date: params.get("date"),
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
  initialMonth,
}: DashboardScreenProps) {
  const router = useRouter();
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
    if (record) mark("c2:dashboard:snapshot-paint");
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
      setWarmRecordsRaw((prev) =>
        capSnapshotMap(typeof updater === "function" ? updater(prev) : updater),
      );
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
  // In-flight reads, aborted when a newer context supersedes them. These are
  // plain route-handler fetches precisely so they can be cancelled — a server
  // action cannot be, and a backlog of them used to stall the calendar.
  const loadAbortRef = useRef<AbortController | null>(null);
  const preloadAbortRef = useRef<AbortController | null>(null);
  const deepLinkAbortRef = useRef<AbortController | null>(null);
  const contextFetchTimerRef = useRef<number | null>(null);
  const speculativeRef = useRef<{
    key: string;
    controller: AbortController;
    promise: Promise<LoadDashboardDataResult>;
  } | null>(null);
  const prefetchGenerationRef = useRef(0);
  const activeLoadKeyRef = useRef<string | null>(null);
  const bootAdoptedRef = useRef(false);
  useEffect(() => {
    mark("c2:dashboard:screen-mount");
    const kind = readLastRendererKind() ?? "month";
    if (canWarmRoutes()) {
      void preloadRendererKind(kind);
    }
    return () => {
      loadAbortRef.current?.abort();
      preloadAbortRef.current?.abort();
      deepLinkAbortRef.current?.abort();
      prefetchGenerationRef.current += 1;
      speculativeRef.current?.controller.abort();
      if (contextFetchTimerRef.current !== null) {
        window.clearTimeout(contextFetchTimerRef.current);
      }
    };
  }, []);
  useEffect(() => {
    const kind = record?.data.activeView.kind;
    if (!kind) return;
    rememberRendererKind(kind);
    if (canWarmRoutes()) {
      void preloadRendererKind(kind);
    }
  }, [record?.data.activeView.kind]);
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
  // when the router transition ends without the URL matching.
  const [previewView, setPreviewView] = useState<string | null>(null);
  // Whether `DashboardView` is currently running a dashboard router transition.
  // The preview may legitimately lead the URL while this is true.
  const navigationPendingRef = useRef(false);
  const [navigationPending, setNavigationPending] = useState(false);
  const reportNavigationPending = useCallback((pending: boolean) => {
    if (navigationPendingRef.current === pending) return;
    navigationPendingRef.current = pending;
    setNavigationPending(pending);
  }, []);

  const view = searchParams.get("view");
  const month = searchParams.get("month");
  const date = searchParams.get("date");

  const editParam = searchParams.get("edit");
  const eventParam = searchParams.get("event");
  const initialEditEventId = editParam && isUuid(editParam) ? editParam : null;
  const initialDetailEventId = eventParam && isUuid(eventParam) ? eventParam : null;

  // The dashboard navigation module owns the display/fetch decision (the
  // candidate request key, warm-record choice, URL-first tab, coverage/skeleton).
  // The screen is a thin adapter over it (src/lib/dashboard/navigation.ts).
  // Deep links no longer bypass the warm cache: their target resolves
  // independently below, so a warm grid can paint without a round-trip.
  const navigation = useMemo(
    () =>
      resolveDashboardNavigation({
        record,
        warmRecords,
        previewView,
        url: { view, month, date },
        failedKey: failedContextKey,
      }),
    [record, warmRecords, previewView, view, month, date, failedContextKey],
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
  // Revert rule: a tap whose navigation never lands must not strand the
  // displayed view away from the URL, or a later action (which builds its href
  // from `searchParams`) would snap back to the URL's tab. While a router
  // transition is pending, the optimistic tab may legitimately lead the URL;
  // once it ends without the URL catching up, clear immediately.
  useEffect(() => {
    const delay = previewRevertDelayMs({
      previewView,
      urlView: view,
      navigationPending,
    });
    if (delay === null) return;

    const timer = window.setTimeout(() => setPreviewView(null), delay);
    return () => window.clearTimeout(timer);
  }, [previewView, view, navigationPending]);

  useReportActivity(refreshing, "dashboard:refresh");

  const fetchFresh = useCallback(
    async (overrideParams?: URLSearchParams) => {
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
      activeLoadKeyRef.current = attemptedKey;
      const bootSignature = dashboardBootSignature({
        view: params.get("view"),
        month: params.get("month"),
        date: params.get("date"),
        refresh: params.get("refresh"),
      });
      const boot =
        !bootAdoptedRef.current && !hasFreshRef.current
          ? takeDashboardBoot(userId, bootSignature, Date.now())
          : null;
      if (boot) {
        bootAdoptedRef.current = true;
      }

      // Supersede any in-flight read: the previous month/tab context is no
      // longer what the URL asks for, and leaving it to finish would make the
      // newer read wait on the old one.
      const speculative = speculativeRef.current;
      const previousController = loadAbortRef.current;
      previousController?.abort();
      if (speculative && speculative.controller === previousController) {
        speculativeRef.current = null;
      }
      const adoptSpeculative =
        speculative !== null &&
        speculative.controller !== previousController &&
        speculative.key === attemptedKey;
      if (speculative && !adoptSpeculative) {
        speculative.controller.abort();
        speculativeRef.current = null;
      }
      if (adoptSpeculative) {
        speculativeRef.current = null;
      }
      const controller =
        adoptSpeculative && speculative ? speculative.controller : new AbortController();
      loadAbortRef.current = controller;
      if (boot) {
        controller.signal.addEventListener("abort", boot.abort, { once: true });
      }
      mark("c2:dashboard:fetch-start");
      try {
        let result: LoadDashboardDataResult | null = null;
        if (boot) {
          const response = await withTimeout(boot.promise, DASHBOARD_LOAD_TIMEOUT_MS);
          if (response) {
            if (response.status === 401) {
              throw new ApiError(401, "Unauthorized");
            }
            if (typeof response.data !== "object" || response.data === null) {
              throw new ApiError(response.status, "Request failed");
            }
            result = response.data as LoadDashboardDataResult;
          }
        }

        if (result === null && adoptSpeculative && speculative) {
          try {
            result = await withTimeout(speculative.promise, DASHBOARD_LOAD_TIMEOUT_MS);
          } catch (error) {
            if (requestId !== requestIdRef.current || isAbortError(error)) throw error;
            result = null;
          }
        }

        if (result === null && requestId === requestIdRef.current) {
          result = await withTimeout(
            postJson<LoadDashboardDataResult>("/api/dashboard/load", inputFromParams(params), {
              signal: controller.signal,
              priority: "high",
            }),
            DASHBOARD_LOAD_TIMEOUT_MS,
          );
        }
        if (result === null || requestId !== requestIdRef.current) return;
        mark("c2:dashboard:fetch-end");
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
      } catch (error) {
        if (isUnauthorized(error)) {
          // The session expired mid-read: the next authenticated page would
          // redirect anyway, so leave the stale (cached) view and go to login.
          router.replace("/login");
          return;
        }
        // An aborted read was superseded by a newer context — not a failure.
        if (isAbortError(error)) return;
        // Network/session failures: keep the cached render.
        if (requestId === requestIdRef.current) {
          setFailedContextKey(attemptedKey);
          if (recordRef.current === null) setLoadFailed(true);
        }
      } finally {
        if (loadAbortRef.current === controller) {
          loadAbortRef.current = null;
        }
        if (requestId === requestIdRef.current) {
          activeLoadKeyRef.current = null;
          setBusy(false);
        }
      }
    },
    [userId, setWarmRecords, router],
  );

  // Retry the first read after the retryable error screen (no cached data to
  // fall back on). Clearing the flag flips the screen back to the skeleton.
  const retryInitialLoad = useCallback(() => {
    setLoadFailed(false);
    void fetchFresh();
  }, [fetchFresh]);

  const prefetchContext = useCallback(
    (target: { view: string; month: string; date: string | null }) => {
      const current = recordRef.current;
      if (!current) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (!canWarmRoutes()) return;
      const tab = current.data.tabs.find((candidate) => candidate.id === target.view);
      if (!tab) return;
      const date = target.date ?? current.context.date;
      const month = target.date ? target.date.slice(0, 7) : (target.month ?? current.context.month);
      const key = dashboardRequestKey({
        viewId: tab.id,
        months: requiredMonths(tab.kind, month, date, current.data.weekStartsOn),
      });
      if (warmRecordsRef.current.has(key)) return;
      if (speculativeRef.current?.key === key) return;
      if (activeLoadKeyRef.current === key) return;
      speculativeRef.current?.controller.abort();
      const controller = new AbortController();
      const generation = prefetchGenerationRef.current;
      const promise = postJson<LoadDashboardDataResult>(
        "/api/dashboard/load",
        { view: tab.id, month, date: target.date, refresh: null },
        { signal: controller.signal, priority: "low" },
      );
      speculativeRef.current = { key, controller, promise };
      promise
        .then((result) => {
          if (speculativeRef.current?.controller === controller) speculativeRef.current = null;
          if (generation !== prefetchGenerationRef.current) return;
          if (!result.ok) return;
          const recordKey = result.record.context.requestKey;
          setWarmRecords((entries) => {
            if (entries.has(recordKey)) return entries;
            const next = new Map(entries);
            next.set(recordKey, result.record);
            return next;
          });
          void writeDashboardSnapshot(userId, result.record.data, result.record.context);
        })
        .catch(() => {
          if (speculativeRef.current?.controller === controller) speculativeRef.current = null;
        });
    },
    [setWarmRecords, userId],
  );

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
                  months: requiredMonths(
                    tab.kind,
                    current.context.month,
                    current.context.date,
                    current.data.weekStartsOn,
                  ),
                }),
              )
              .filter((key) => !warm.has(key)),
          ),
        );
      }
      preloadAbortRef.current?.abort();
      const controller = new AbortController();
      preloadAbortRef.current = controller;
      setPreloading(true);
      try {
        const result = await postJson<PreloadDashboardTabsResult>(
          "/api/dashboard/preload",
          inputFromParams(paramsRef.current),
          { signal: controller.signal },
        );
        if (preloadGenerationRef.current !== generation) return;
        if (preloadedRef.current?.signature !== signature) return;
        if (!result.ok) return;
        const records: DashboardSnapshotRecord[] = result.records.map((entry) => ({
          version: DASHBOARD_SNAPSHOT_VERSION,
          savedAt: Date.now(),
          context: entry.context,
          data: assembleDashboardSnapshot(result.shared, entry.delta),
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
      } catch {
        // Best-effort warm-up: an aborted/offline/failed pass is invisible. The
        // active tab is already loaded, and any other tab fetches on demand.
      } finally {
        if (preloadAbortRef.current === controller) {
          preloadAbortRef.current = null;
        }
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
  // cached context for the anchor the load names (URL params, then the device
  // cookie) on the resolved tab. A fresh server response always wins if it lands
  // first. A force-refresh reload clears the cache instead of painting it.
  useEffect(() => {
    let alive = true;
    let idleHandle: number | null = null;
    const paintOptions = () => ({
      urlView: paramsRef.current.get("view"),
      urlMonth: paramsRef.current.get("month"),
      urlDate: paramsRef.current.get("date"),
      rememberedMonth: initialMonth,
    });
    const overlay = (cached: readonly DashboardSnapshotRecord[]) => {
      if (cached.length === 0) return;
      setWarmRecords((current) => {
        const next = new Map(cached.map((entry) => [entry.context.requestKey, entry]));
        for (const [key, value] of current) {
          next.set(key, value);
        }
        return next;
      });
    };
    const paint = (record: DashboardSnapshotRecord) => {
      if (hasFreshRef.current) return;
      setSource("cache");
      setRecord(record);
    };
    const hydrateRemaining = () => {
      void readDashboardSnapshots(userId).then((cached) => {
        if (!alive) return;
        overlay(cached);
      });
    };
    const scheduleHydrate = () => {
      if (typeof requestIdleCallback === "function") {
        idleHandle = requestIdleCallback(hydrateRemaining, { timeout: 2000 });
      } else {
        idleHandle = window.setTimeout(hydrateRemaining, 0);
      }
    };

    void (async () => {
      if (isRefreshNonceFresh(paramsRef.current.get("refresh"), Date.now())) {
        void clearDashboardSnapshots(userId);
        return;
      }

      const index = await readDashboardSnapshotIndex(userId);
      if (!alive) return;
      if (index) {
        const key = pickColdPaintKey(index, paintOptions());
        if (key) {
          const record = await readDashboardSnapshot(userId, key);
          if (!alive) return;
          if (record && record.context.requestKey === key) {
            overlay([record]);
            paint(record);
            scheduleHydrate();
            return;
          }
        }
      }

      const cached = await readDashboardSnapshots(userId);
      if (!alive) return;
      overlay(cached);
      if (hasFreshRef.current || cached.length === 0) return;
      const coldPaint = pickColdPaintRecord(cached, paintOptions());
      if (!coldPaint) return;
      paint(coldPaint);
    })();

    return () => {
      alive = false;
      if (idleHandle !== null) {
        if (typeof cancelIdleCallback === "function") {
          cancelIdleCallback(idleHandle);
        } else {
          window.clearTimeout(idleHandle);
        }
      }
    };
  }, [userId, setWarmRecords, initialMonth]);

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
    // The first read (nothing cached to paint) stays immediate; later context
    // changes are coalesced so a held month chevron or a rapid tab/date burst
    // issues one read instead of one per tap. `fetchFresh` also aborts the
    // previous request, so only the last context reaches the server.
    if (recordRef.current === null) {
      void fetchFresh();
      return;
    }
    if (contextFetchTimerRef.current !== null) {
      window.clearTimeout(contextFetchTimerRef.current);
    }
    contextFetchTimerRef.current = window.setTimeout(() => {
      contextFetchTimerRef.current = null;
      void fetchFresh();
    }, CONTEXT_FETCH_DEBOUNCE_MS);
    return () => {
      if (contextFetchTimerRef.current !== null) {
        window.clearTimeout(contextFetchTimerRef.current);
        contextFetchTimerRef.current = null;
      }
    };
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
        prefetchGenerationRef.current += 1;
        speculativeRef.current?.controller.abort();
        speculativeRef.current = null;
        // Keep the signature: a force refresh must not trigger another full
        // background warm-up on top of the read it already forces.
        preloadAbortRef.current?.abort();
        setPreloading(false);
        setBackgroundKeys(new Set());
        setWarmRecords(new Map());
        void clearDashboardSnapshots(userId);
        void fetchFresh();
      });
    }
  }, [refreshParam, fetchFresh, userId, setWarmRecords]);

  // Preload once the active context is fresh and idle: every tab for the
  // current anchor, plus the active tab for the next two months, so a tab
  // switch or a forward month navigation paints instantly (docs/pwa-offline.md
  // §1.18). Runs once per anchor signature (committed tab + tab set + the months
  // those tabs need), deferred to idle so it never delays first paint, and
  // skipped offline. Also skipped on weak devices / constrained connections —
  // it costs a server read plus a write per record, and the active tab is always
  // loaded, so a skipped preload only means a later context fetches on demand.
  useEffect(() => {
    if (!record || source !== "fresh" || busy) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (!canPreloadTabs()) return;
    const tabs = record.data.tabs;
    const months = [
      ...new Set(
        tabs.flatMap((tab) =>
          requiredMonths(
            tab.kind,
            record.context.month,
            record.context.date,
            record.data.weekStartsOn,
          ),
        ),
      ),
    ].sort();
    // The signature deliberately excludes the active `?view=`: switching tabs
    // must not re-run the whole background read (the warm records it would
    // refresh are already in place). It changes only when the tab set or the
    // anchor's required months change.
    const signature = `${tabs.map((tab) => tab.id).join(",")}|${months.join(",")}`;
    const generation = preloadGenerationRef.current;
    // Once a signature has been warmed, it stays warmed for this mount. A
    // mutation bumps the generation (discarding in-flight results) but does not
    // force another full pass: the active tab is re-read by `revalidate`, and
    // any other tab fetches on demand instead of making the user wait.
    if (preloadedRef.current?.signature === signature) {
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
      prefetchGenerationRef.current += 1;
      speculativeRef.current?.controller.abort();
      speculativeRef.current = null;
      // Discard an in-flight warm-up's results without scheduling another pass
      // (see the preload effect): the user is waiting on this read.
      preloadAbortRef.current?.abort();
      setPreloading(false);
      setBackgroundKeys(new Set());
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
        months: requiredMonths(
          tab.kind,
          record.context.month,
          record.context.date,
          record.data.weekStartsOn,
        ),
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
      weekStartsOn: record.data.weekStartsOn,
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
      reportNavigationPending,
      applyViewTab,
      prefetchContext,
    }),
    [
      revalidate,
      isNavigating,
      setPreviewView,
      reportNavigationPending,
      applyViewTab,
      prefetchContext,
    ],
  );

  // A `?event=`/`?edit=` link resolves its target independently of the grid and
  // the snapshot: the lean route-handler read touches only the target's own
  // months and runs genuinely in parallel with the dashboard load (both are
  // plain fetches, not serialized server actions), so the details modal never
  // waits for — or races — the one-shot URL strip.
  const deepLinkId = initialEditEventId ?? initialDetailEventId;
  const deepLinkCalendarId = searchParams.get("_eventCal");
  const deepLinkRequestKey = deepLinkId
    ? `${deepLinkId}|${date ?? ""}|${deepLinkCalendarId ?? ""}|${view ?? ""}`
    : null;
  // The latest request, read by the effect without re-triggering it when the
  // held record changes.
  const deepLinkRequestRef = useRef({
    date,
    calendarId: deepLinkCalendarId,
    view,
  });
  useEffect(() => {
    deepLinkRequestRef.current = {
      date,
      calendarId: deepLinkCalendarId,
      view,
    };
  }, [date, deepLinkCalendarId, view]);

  const [deepLinkTarget, setDeepLinkTarget] = useState<CalendarEvent | null>(null);
  // The link whose independent read has settled (resolved, missing, failed, or
  // timed out). `DashboardView` holds its skeleton until this is true-and-no
  // target, then raises the "Could not open that event" advisory.
  const [settledDeepLinkId, setSettledDeepLinkId] = useState<string | null>(null);
  const attemptedDeepLinkRef = useRef<string | null>(null);
  const deepLinkRequestIdRef = useRef(0);

  useEffect(() => {
    if (!deepLinkRequestKey || !deepLinkId) {
      attemptedDeepLinkRef.current = null;
      deepLinkRequestIdRef.current += 1;
      deepLinkAbortRef.current?.abort();
      // Deferred: an effect must not call setState synchronously (same pattern
      // as `fetchFresh`).
      void Promise.resolve().then(() => {
        setDeepLinkTarget(null);
        setSettledDeepLinkId(null);
      });
      return;
    }
    if (attemptedDeepLinkRef.current === deepLinkRequestKey) return;
    attemptedDeepLinkRef.current = deepLinkRequestKey;
    // Invalidate any in-flight read for an earlier link before deciding whether
    // this one needs a read at all.
    const requestId = ++deepLinkRequestIdRef.current;

    const request = deepLinkRequestRef.current;
    const held = recordRef.current;
    const warm = candidateKey ? (warmRecordsRef.current.get(candidateKey) ?? null) : null;
    // Mirror `resolveDashboardNavigation`'s display-record pick: a warm record is
    // used only when it is a different context than the held one.
    const displayRecord =
      warm !== null && warm.context.requestKey !== held?.context.requestKey ? warm : held;
    const gridHasTarget =
      displayRecord !== null &&
      displayRecord.context.requestKey === candidateKey &&
      displayRecord.data.events.some((event) => event.payload.eventId === deepLinkId);
    if (gridHasTarget) {
      // The grid the screen will paint already carries the target (and
      // `DashboardView` prefers the grid copy): nothing to read.
      deepLinkAbortRef.current?.abort();
      void Promise.resolve().then(() => setSettledDeepLinkId(deepLinkId));
      return;
    }

    const viewKind =
      (request.view
        ? recordRef.current?.data.tabs.find((tab) => tab.id === request.view)?.kind
        : undefined) ??
      recordRef.current?.data.activeView.kind ??
      null;
    deepLinkAbortRef.current?.abort();
    const controller = new AbortController();
    deepLinkAbortRef.current = controller;
    void withTimeout(
      postJson<DeepLinkResult>(
        "/api/dashboard/deep-link",
        {
          eventId: deepLinkId,
          date: request.date,
          calendarId: request.calendarId,
          view: request.view,
          viewKind,
          force: isRefreshNonceFresh(refreshParam, Date.now()),
        },
        { signal: controller.signal },
      ),
      DASHBOARD_LOAD_TIMEOUT_MS,
    )
      .then((result) => {
        if (deepLinkRequestIdRef.current !== requestId) return;
        setDeepLinkTarget(result.ok ? result.event : null);
        setSettledDeepLinkId(deepLinkId);
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        if (deepLinkRequestIdRef.current !== requestId) return;
        setDeepLinkTarget(null);
        setSettledDeepLinkId(deepLinkId);
      })
      .finally(() => {
        if (deepLinkAbortRef.current === controller) {
          deepLinkAbortRef.current = null;
        }
      });
    // The record/freshness reads happen through refs on purpose: a record
    // arriving mid-read must not start a second request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkRequestKey]);

  // Whether the record the screen is rendering (the held one, or a warm
  // candidate for this URL) already carries the deep link's target — the grid is
  // the authoritative copy when it does.
  const deepLinkGridResolved =
    deepLinkId !== null &&
    navigation.displayRecord !== null &&
    navigation.displayRecord.context.requestKey === candidateKey &&
    navigation.displayRecord.data.events.some((event) => event.payload.eventId === deepLinkId);
  // Whether the deep link has settled: resolved from the grid, or the
  // independent read finished (with or without a target).
  const deepLinkSettled =
    deepLinkId !== null && (deepLinkGridResolved || settledDeepLinkId === deepLinkId);

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
    return <DashboardShellSkeleton brand={isColdLaunchActive()} />;
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
          deepLinkEvent={deepLinkTarget}
          deepLinkSettled={deepLinkSettled}
        />
      </DashboardTabStatusProvider>
    </DashboardDataProvider>
  );
}
