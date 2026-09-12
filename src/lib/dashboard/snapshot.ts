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
import {
  monthGridMonths,
  monthsInRange,
  weekDays,
} from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";
import { resolveActiveTab, type DashboardViewKind } from "@/lib/dashboardViews/views";

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
  | "deepLinkEvent"
>;

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
 * - Week (H) / Week (D): the months the Monday-first week touches (1-2).
 * - Day / Agenda: the single containing month.
 *
 * Pure and client-safe (reuses the `datetime.ts` helpers), so the server
 * (`buildDashboardData`) and the client (`DashboardScreen`) compute the same
 * set for the same input.
 */
export function requiredMonths(kind: DashboardViewKind, month: string, date: string): string[] {
  if (kind === "month") {
    return monthGridMonths(month);
  }
  if (kind === "week" || kind === "weekv2") {
    const week = weekDays(date);
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
 * The fetch signature the current URL asks for, given the last loaded record:
 * the resolved tab id plus the months that tab needs (see `requiredMonths`).
 *
 * The day within a month is intentionally absent, so an in-month day move
 * produces the same signature as the held record and triggers no fetch — the
 * URL day still drives the rendered grid/chrome directly (`DashboardScreen`
 * passes it as the URL-first `date` prop), it just never reaches the server.
 *
 * Month precedence mirrors the server (`buildDashboardData`): an explicit
 * `?date=` wins (its month is authoritative), then `?month=`, then the held
 * record's context. Returns null before the first record is available (the
 * mount read always runs).
 */
export function dashboardCandidateRequestKey(
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
    months: requiredMonths(tab.kind, month, date),
  });
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
