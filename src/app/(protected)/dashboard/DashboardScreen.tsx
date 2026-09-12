"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useReportActivity } from "@/components/ActivityBar";
import { loadDashboardData } from "@/lib/dashboard/actions";
import { readDashboardSnapshot, writeDashboardSnapshot } from "@/lib/dashboard/localStore";
import {
  dashboardRequestKey,
  isRefreshNonceFresh,
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
  const dataKey = useMemo(
    () => dashboardRequestKey({ view, month, date }),
    [view, month, date],
  );
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

  // Always revalidate when the data-bearing context changes (mount, month/date
  // navigation, tab switch). A fresh `?refresh=` nonce is handled separately so
  // it also forces a read when only the nonce changed.
  useEffect(() => {
    if (isRefreshNonceFresh(paramsRef.current.get("refresh"), Date.now())) return;
    void fetchFresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

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
        busy && source === "fresh" && record !== null && record.context.requestKey !== dataKey,
    }),
    [revalidate, busy, source, record, dataKey],
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
  // link whose view/month/date is unchanged triggers no fetch. When the record
  // is already for the current context but lacks the target, resolve it once
  // (the server reads the target separately from the grid); the attempted-id
  // ref prevents a loop when the event no longer exists.
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
    if (!record || record.context.requestKey !== dataKey) return;
    attemptedDeepLinkRef.current = deepLinkId;
    const inEvents = record.data.events.some((event) => event.payload.eventId === deepLinkId);
    const inDeepLink = record.deepLinkEvent?.payload.eventId === deepLinkId;
    if (!inEvents && !inDeepLink) {
      // `fetchFresh` defers its setState to a microtask (see its own comment),
      // so this is not a synchronous state update.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchFresh();
    }
  }, [deepLinkId, record, dataKey, fetchFresh]);

  if (!record || (hasDeepLink && source === "cache")) {
    return <DashboardShellSkeleton />;
  }

  return (
    <DashboardDataProvider value={context}>
      <DashboardView
        {...record.data}
        month={record.context.month}
        date={record.context.date}
        initialZoom={initialZoom}
        initialMonthZoom={initialMonthZoom}
        initialEditEventId={initialEditEventId}
        initialDetailEventId={initialDetailEventId}
        deepLinkEvent={record.deepLinkEvent ?? null}
      />
    </DashboardDataProvider>
  );
}
