"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useReportActivity } from "@/components/ActivityBar";
import { loadDashboardData } from "@/lib/dashboard/actions";
import {
  clearDashboardSnapshots,
  readDashboardSnapshots,
  writeDashboardSnapshot,
} from "@/lib/dashboard/localStore";
import {
  dashboardCandidateRequestKey,
  equivalentDashboardTab,
  isRefreshNonceFresh,
  isWarmSnapshotFresh,
  resolveDashboardPresentation,
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
  // The latest busy flag, read by the fetch-decision effect so an equivalent-tab
  // local swap never races an in-flight read (see the effect below).
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  // The candidate request key whose fetch last failed, so the view can heal back
  // to the held tab on a failed/offline navigation (see the presentation below).
  const [failedContextKey, setFailedContextKey] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const hasFreshRef = useRef(false);
  const lastRefreshRef = useRef<string | null>(null);

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

  // The data identity the current URL asks for (tab + required months). It does
  // not change for an in-month day move, so such a move never fetches. `urlKey`
  // is the raw URL fingerprint that re-runs the fetch-decision effect below.
  const candidateKey = useMemo(
    () => dashboardCandidateRequestKey(record, view, month, date),
    [record, view, month, date],
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
        ? resolveDashboardPresentation(displayRecord, view, month, date, {
            cached: displayRecord !== record || source === "cache",
            // A warm context stays visible even if its background read fails —
            // don't heal back to the previous tab.
            failedKey: displayRecord !== record ? null : failedContextKey,
          })
        : null,
    [displayRecord, record, view, month, date, source, failedContextKey],
  );
  const isNavigating = presentation?.isNavigating ?? false;
  const urlKey = `${view ?? ""}|${month ?? ""}|${date ?? ""}`;
  const refreshParam = searchParams.get("refresh");

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
      const result = await loadDashboardData(inputFromParams(paramsRef.current));
      if (requestId !== requestIdRef.current) return;
      if (result.ok) {
        hasFreshRef.current = true;
        setSource("fresh");
        setFailedContextKey(null);
        setRecord(result.record);
        setWarmRecords((current) => {
          const next = new Map(current);
          next.set(result.record.context.requestKey, result.record);
          return next;
        });
        void writeDashboardSnapshot(userId, result.record.data, result.record.context);
      } else {
        setFailedContextKey(attemptedKey);
      }
      // A failed read keeps the cached snapshot on screen (offline reads work);
      // the OfflineBanner is the user-facing signal.
    } catch {
      // Network/session failures: keep the cached render.
      if (requestId === requestIdRef.current) {
        setFailedContextKey(attemptedKey);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setBusy(false);
      }
    }
  }, [userId]);

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
    const urlView = paramsRef.current.get("view");
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
    void fetchFresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey]);

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
        setWarmRecords(new Map());
        void clearDashboardSnapshots(userId);
        void fetchFresh();
      });
    }
  }, [refreshParam, fetchFresh, userId]);

  // Post-mutation / filter-change refresh: drop every cached context (the write
  // may affect any of them), then re-read the current one.
  const revalidate = useCallback(() => {
    setWarmRecords(new Map());
    void (async () => {
      await clearDashboardSnapshots(userId);
      await fetchFresh();
    })();
  }, [fetchFresh, userId]);

  const context = useMemo(
    () => ({
      revalidate,
      isRevalidating: busy,
      // Coverage-based, not tied to the router transition or `busy`: it stays
      // true from the instant the URL context changes until the held data
      // answers it (or the fetch fails), so the grid skeleton can't flash or gap
      // around the data fetch.
      isNavigating,
    }),
    [revalidate, busy, isNavigating],
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

  if (!record || (hasDeepLink && source === "cache")) {
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
