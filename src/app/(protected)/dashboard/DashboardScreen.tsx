"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useReportActivity } from "@/components/ActivityBar";
import { loadDashboardData } from "@/lib/dashboard/actions";
import { readDashboardSnapshot, writeDashboardSnapshot } from "@/lib/dashboard/localStore";
import {
  dashboardRequestKey,
  isRefreshNonceFresh,
  requiredMonths,
  type DashboardSnapshotRecord,
} from "@/lib/dashboard/snapshot";
import { resolveActiveTab } from "@/lib/dashboardViews/views";
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
 * The fetch signature the current URL asks for, given the last loaded record:
 * the resolved tab id plus the months that tab needs (see `requiredMonths`).
 * The day within a month is intentionally absent, so an in-month day move
 * produces the same signature as the held record and triggers no fetch — the
 * URL day still drives the rendered grid/chrome directly (see `effectiveDate`
 * below), it just never reaches the server. Returns null before the first
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
  const month = urlMonth ?? (urlDate ? urlDate.slice(0, 7) : record.context.month);
  const date = urlDate ?? record.context.date;
  return dashboardRequestKey({
    viewId: tab.id,
    months: requiredMonths(tab.kind, month, date),
  });
}

/**
 * The Calendar route's client data layer (docs/pwa-offline.md).
 *
 * On mount it paints the last snapshot stored on this device, then always
 * revalidates against the server in the background and swaps the fresh data in
 * place — no skeleton, no remount, no scroll/selection loss. A mutation calls
 * `revalidate()` through the context. A failed revalidation keeps the cached
 * render (offline reads keep working).
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
  // The latest record, read by the fetch-decision effect without re-triggering
  // it when the record changes (a completed fetch must not schedule another).
  const recordRef = useRef(record);
  useEffect(() => {
    recordRef.current = record;
  }, [record]);
  // Whether the displayed record came from the device cache or a fresh server
  // read. A cached record is shown through a context-changing revalidation
  // (instant paint, update in place); only once we're on fresh data does a
  // context change read as a navigation and show the grid skeleton.
  const [source, setSource] = useState<"cache" | "fresh">("fresh");
  const [busy, setBusy] = useState(false);
  const requestIdRef = useRef(0);
  const hasFreshRef = useRef(false);
  const lastRefreshRef = useRef<string | null>(null);

  const view = searchParams.get("view");
  const month = searchParams.get("month");
  const date = searchParams.get("date");
  // The data identity the current URL asks for (tab + required months). It does
  // not change for an in-month day move, so such a move never fetches. `urlKey`
  // is the raw URL fingerprint that re-runs the fetch-decision effect below.
  const candidateKey = useMemo(
    () => candidateRequestKey(record, view, month, date),
    [record, view, month, date],
  );
  const urlKey = `${view ?? ""}|${month ?? ""}|${date ?? ""}`;
  const refreshParam = searchParams.get("refresh");

  useReportActivity(busy, "dashboard:revalidate");

  const fetchFresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    // Yield first: an effect must not call setState synchronously, and this
    // fetch is always kicked off from an effect or an event handler.
    await Promise.resolve();
    setBusy(true);
    try {
      const result = await loadDashboardData(inputFromParams(paramsRef.current));
      if (requestId !== requestIdRef.current) return;
      if (result.ok) {
        hasFreshRef.current = true;
        setSource("fresh");
        setRecord(result.record);
        void writeDashboardSnapshot(userId, result.record.data, result.record.context);
      }
      // A failed read keeps the cached snapshot on screen (offline reads work);
      // the OfflineBanner is the user-facing signal.
    } catch {
      // Network/session failures: keep the cached render.
    } finally {
      if (requestId === requestIdRef.current) {
        setBusy(false);
      }
    }
  }, [userId]);

  // Paint the last on-device snapshot as soon as it is read. A fresh server
  // response always wins if it lands first.
  useEffect(() => {
    let alive = true;
    void readDashboardSnapshot(userId).then((cached) => {
      if (!alive || hasFreshRef.current || !cached) return;
      setSource("cache");
      setRecord(cached);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  // Fetch only when the URL asks for data the held record doesn't already
  // cover (mount, tab switch, month-set change) — never for an in-month day
  // move. A fresh `?refresh=` nonce is handled separately so it also forces a
  // read when only the nonce changed.
  useEffect(() => {
    if (isRefreshNonceFresh(paramsRef.current.get("refresh"), Date.now())) return;
    const current = recordRef.current;
    const candidate = candidateRequestKey(
      current,
      paramsRef.current.get("view"),
      paramsRef.current.get("month"),
      paramsRef.current.get("date"),
    );
    if (current && candidate !== null && current.context.requestKey === candidate) {
      return;
    }
    void fetchFresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey]);

  // A fresh `?refresh=` nonce (header Force refresh reload, or the inactivity
  // refresh's soft navigation) forces a read even though the data key is
  // unchanged.
  useEffect(() => {
    if (!refreshParam || lastRefreshRef.current === refreshParam) return;
    lastRefreshRef.current = refreshParam;
    if (isRefreshNonceFresh(refreshParam, Date.now())) {
      // The fetch defers its setState to a microtask (see `fetchFresh`), so this
      // is not a synchronous state update.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchFresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshParam]);

  const revalidate = useCallback(() => {
    void fetchFresh();
  }, [fetchFresh]);

  const context = useMemo(
    () => ({
      revalidate,
      isRevalidating: busy,
      isNavigating:
        busy && source === "fresh" && record !== null && record.context.requestKey !== candidateKey,
    }),
    [revalidate, busy, source, record, candidateKey],
  );

  const editParam = searchParams.get("edit");
  const eventParam = searchParams.get("event");
  const initialEditEventId = editParam && isUuid(editParam) ? editParam : null;
  const initialDetailEventId = eventParam && isUuid(eventParam) ? eventParam : null;
  // A deep link targets a specific event that the cached snapshot may not
  // contain (a different month, a just-created event). Resolve those against
  // fresh data only: skip the cached paint so the event is found when the form
  // / details modal opens.
  const hasDeepLink = initialEditEventId !== null || initialDetailEventId !== null;

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
    // Only a link arriving after we already hold fresh data for this context
    // needs the extra read; a context-changing link is covered by the normal
    // revalidation (which carries `_eventCal`).
    if (!hasFreshRef.current) return;
    if (!record || record.context.requestKey !== candidateKey) return;
    attemptedDeepLinkRef.current = deepLinkId;
    const inEvents = record.data.events.some((event) => event.payload.eventId === deepLinkId);
    const inDeepLink = record.deepLinkEvent?.payload.eventId === deepLinkId;
    if (!inEvents && !inDeepLink) {
      // `fetchFresh` defers its setState to a microtask (see its own comment),
      // so this is not a synchronous state update.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchFresh();
    }
  }, [deepLinkId, record, candidateKey, fetchFresh]);

  if (!record || (hasDeepLink && source === "cache")) {
    return <DashboardShellSkeleton />;
  }

  // The day the view renders. The URL wins when it pins one: an in-month move
  // never fetches, so `record.context.date` would otherwise stay on the last
  // read's day and the Day/Week (H) grids, chrome and back/forward would not
  // move. Falls back to the server-resolved day when the URL omits `?date=`
  // (Month view, or a cold anchored start).
  const effectiveDate = date ?? record.context.date;

  return (
    <DashboardDataProvider value={context}>
      <DashboardView
        {...record.data}
        month={record.context.month}
        date={effectiveDate}
        initialZoom={initialZoom}
        initialMonthZoom={initialMonthZoom}
        initialEditEventId={initialEditEventId}
        initialDetailEventId={initialDetailEventId}
        deepLinkEvent={record.deepLinkEvent ?? null}
      />
    </DashboardDataProvider>
  );
}
