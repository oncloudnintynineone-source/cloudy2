import { after } from "next/server";

import { apiJsonBody, optionalString, withApiJson } from "@/lib/api/server";
import { recordActivityMinute } from "@/lib/metrics/activity";
import { maybeFlushRunningCounters, recordRouteResponse } from "@/lib/metrics/running";
import { loadDashboardData } from "@/lib/dashboard/actions";

/**
 * The dashboard's active-context read (docs/pwa-offline.md).
 *
 * A route handler rather than a server action so it bypasses the App Router's
 * single-flight action queue: a background preload must never delay the grid
 * read that follows a month/tab change. The client sends the same input the
 * old action took and aborts the request when a newer context supersedes it.
 *
 * This is also the app's hottest authenticated read, so it carries the
 * resource ledger's request-path accounting: the activity-minute sample and
 * the response's byte count (the egress estimate, src/lib/metrics/running.ts).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROUTE = "/api/dashboard/load";

interface LoadBody {
  view?: unknown;
  month?: unknown;
  date?: unknown;
  refresh?: unknown;
}

export async function POST(request: Request) {
  const auth = await withApiJson<LoadBody>(request);
  if (!auth.ok) {
    return auth.response;
  }
  const body = auth.body;

  // The ledger's request-path hooks. One activity write per minute per
  // instance is dense enough for the compute estimate, and the counter flush
  // rides the same wake-up — `after()` keeps both off the response path
  // entirely (src/lib/metrics/activity.ts, src/lib/metrics/running.ts).
  after(() => {
    void recordActivityMinute();
    void maybeFlushRunningCounters();
  });

  try {
    const result = await loadDashboardData({
      view: optionalString(body.view),
      month: optionalString(body.month),
      date: optionalString(body.date),
      refresh: optionalString(body.refresh),
    });
    const payload = JSON.stringify(result);
    recordRouteResponse(ROUTE, Buffer.byteLength(payload), true);
    return apiJsonBody(payload);
  } catch (error) {
    recordRouteResponse(ROUTE, 0, false);
    throw error;
  }
}
