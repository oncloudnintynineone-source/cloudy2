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
>;

/**
 * What the snapshot was rendered for. `requestKey` is the data-affecting URL
 * fingerprint (view/month/date only — never the one-shot edit/event/refresh
 * params), so a background revalidation of the same context doesn't read as a
 * navigation.
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

/** The data-affecting URL params a dashboard render depends on. */
export interface DashboardRequestParams {
  view?: string | null;
  month?: string | null;
  date?: string | null;
}

/**
 * Stable fingerprint of the data-affecting params. The one-shot `edit`/`event`/
 * `_eventCal`/`refresh` params are deliberately absent: changing or stripping
 * them must not be treated as a context change (no refetch, no skeleton).
 */
export function dashboardRequestKey(params: DashboardRequestParams): string {
  const search = new URLSearchParams();
  if (params.view) search.set("view", params.view);
  if (params.month) search.set("month", params.month);
  if (params.date) search.set("date", params.date);
  return search.toString();
}

/** Whether a stored record matches the current snapshot shape. */
export function isSnapshotRecordUsable(
  record: DashboardSnapshotRecord | null | undefined,
): record is DashboardSnapshotRecord {
  return (
    !!record &&
    record.version === DASHBOARD_SNAPSHOT_VERSION &&
    !!record.context &&
    typeof record.context.month === "string" &&
    typeof record.context.date === "string" &&
    typeof record.context.requestKey === "string" &&
    !!record.data
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
