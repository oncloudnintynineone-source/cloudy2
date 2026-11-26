import { after } from "next/server";

import { apiJson, optionalString, withApiJson } from "@/lib/api/server";
import { recordActivityMinute } from "@/lib/metrics/activity";
import { loadDashboardData } from "@/lib/dashboard/actions";

/**
 * The dashboard's active-context read (docs/pwa-offline.md).
 *
 * A route handler rather than a server action so it bypasses the App Router's
 * single-flight action queue: a background preload must never delay the grid
 * read that follows a month/tab change. The client sends the same input the
 * old action took and aborts the request when a newer context supersedes it.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  // The ledger's activity sample. This is the app's hottest authenticated read,
  // so one write per minute per instance here is dense enough for the compute
  // estimate to be meaningful — and `after()` keeps it off the response path
  // entirely (src/lib/metrics/activity.ts).
  after(() => recordActivityMinute());
  const result = await loadDashboardData({
    view: optionalString(body.view),
    month: optionalString(body.month),
    date: optionalString(body.date),
    refresh: optionalString(body.refresh),
  });
  return apiJson(result);
}
