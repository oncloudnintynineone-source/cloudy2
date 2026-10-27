/**
 * Dashboard data loaders (docs/pwa-offline.md).
 *
 * The Calendar route renders a thin client shell; these functions re-read the
 * same server data the page used to resolve inline and return it as a
 * serializable snapshot for the device-local cache.
 *
 * They are deliberately **not** server actions: the route handlers under
 * `/api/dashboard/*` call them and the client fetches those routes directly, so
 * dashboard reads never enter the App Router's single-flight server-action
 * queue (a background preload could otherwise delay the user's next save or
 * month read — see docs/loading-transitions.md). The service worker already
 * keeps `/api/*` uncached. Server-only.
 *
 * Failures are returned, never thrown to the client: a failed revalidation
 * must leave the cached snapshot on screen (and the request surface as an
 * error), not blank the calendar.
 */

import { requireSession } from "@/lib/session";

import { buildDashboardData, buildDashboardPreload } from "./data";
import {
  DASHBOARD_SNAPSHOT_VERSION,
  isRefreshNonceFresh,
  type DashboardSharedConfig,
  type DashboardSnapshotContext,
  type DashboardSnapshotRecord,
  type DashboardTabDelta,
} from "./snapshot";

export interface LoadDashboardDataInput {
  view?: string | null;
  month?: string | null;
  date?: string | null;
  refresh?: string | null;
}

export type LoadDashboardDataResult =
  { ok: true; record: DashboardSnapshotRecord } | { ok: false; error: string };

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function loadDashboardData(
  input: LoadDashboardDataInput,
): Promise<LoadDashboardDataResult> {
  // Outside the try: an expired session redirects to /login and must propagate.
  const session = await requireSession();

  try {
    const built = await buildDashboardData(
      {
        view: asString(input.view),
        month: asString(input.month),
        date: asString(input.date),
        force: isRefreshNonceFresh(asString(input.refresh), Date.now()),
      },
      session,
    );
    return {
      ok: true,
      record: {
        version: DASHBOARD_SNAPSHOT_VERSION,
        savedAt: Date.now(),
        context: {
          month: built.month,
          date: built.date,
          viewId: built.viewId,
          requestKey: built.requestKey,
        },
        data: built.data,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load the calendar",
    };
  }
}

export interface DashboardPreloadRecord {
  context: DashboardSnapshotContext;
  delta: DashboardTabDelta;
}

export type PreloadDashboardTabsResult =
  | { ok: true; shared: DashboardSharedConfig; records: DashboardPreloadRecord[] }
  | { ok: false; error: string };

/**
 * Background preload (docs/pwa-offline.md §1.18). After the active context
 * paints, the client calls this to warm every tab for the current anchor plus
 * the active tab for the next two months, off a single cache read per anchor
 * set, so a tab switch or a forward month navigation paints from the device
 * cache with no round-trip. Never forces a Google refresh; failures are
 * returned, not thrown, so a failed preload never disturbs the painted calendar.
 */
export async function preloadDashboardTabs(
  input: LoadDashboardDataInput,
): Promise<PreloadDashboardTabsResult> {
  const session = await requireSession();

  try {
    const built = await buildDashboardPreload(
      {
        view: asString(input.view),
        month: asString(input.month),
        date: asString(input.date),
        // Preload warms what the active read already fetched; never force.
        force: false,
      },
      session,
    );
    return { ok: true, shared: built.shared, records: built.records };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not preload the calendar",
    };
  }
}
