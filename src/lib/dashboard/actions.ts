"use server";

/**
 * Dashboard data loader (docs/pwa-offline.md).
 *
 * The Calendar route renders a thin client shell; this action re-reads the
 * same server data the page used to resolve inline and returns it as a
 * serializable snapshot for the device-local cache. It is a read-only POST, so
 * the service worker's `NetworkOnly` fallback already keeps it uncached.
 *
 * Failures are returned, never thrown to the client: a failed revalidation
 * must leave the cached snapshot on screen (and the request surface as an
 * error), not blank the calendar.
 */

import { requireSession } from "@/lib/session";

import { buildDashboardData } from "./data";
import {
  DASHBOARD_SNAPSHOT_VERSION,
  isRefreshNonceFresh,
  type DashboardSnapshotRecord,
} from "./snapshot";

export interface LoadDashboardDataInput {
  view?: string | null;
  month?: string | null;
  date?: string | null;
  edit?: string | null;
  event?: string | null;
  eventCal?: string | null;
  refresh?: string | null;
}

export type LoadDashboardDataResult =
  | { ok: true; record: DashboardSnapshotRecord }
  | { ok: false; error: string };

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
        edit: asString(input.edit),
        event: asString(input.event),
        eventCal: asString(input.eventCal),
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
