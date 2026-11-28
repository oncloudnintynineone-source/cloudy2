import { after } from "next/server";

import { apiJsonBody, optionalString, withApiJson } from "@/lib/api/server";
import { maybeFlushRunningCounters, recordRouteResponse } from "@/lib/metrics/running";
import { preloadDashboardTabs } from "@/lib/dashboard/actions";

/**
 * Background tab preload (docs/pwa-offline.md §1.18). A route handler so the
 * pass is a plain fetch the client can cancel or ignore — never a queued server
 * action competing with the user's next save/read.
 *
 * The default scope warms only the active tab's adjacent anchors; every other
 * tab loads on demand (tap) or on intent (hover/focus/press) instead of being
 * downloaded speculatively, which is what keeps a launch from shipping the
 * union of every tab's calendars × months (docs/neon-usage.md). `scope: "all"`
 * restores the legacy eager pass as an explicit rollback.
 *
 * Like the load route, its responses are counted for the resource ledger —
 * after the load pass, this is the traffic the egress estimate is built from.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROUTE = "/api/dashboard/preload";

interface PreloadBody {
  view?: unknown;
  month?: unknown;
  date?: unknown;
  adjacentOnly?: unknown;
  scope?: unknown;
}

export async function POST(request: Request) {
  const auth = await withApiJson<PreloadBody>(request);
  if (!auth.ok) {
    return auth.response;
  }
  const body = auth.body;

  after(() => {
    void maybeFlushRunningCounters();
  });

  try {
    const result = await preloadDashboardTabs({
      view: optionalString(body.view),
      month: optionalString(body.month),
      date: optionalString(body.date),
      adjacentOnly: body.adjacentOnly === true,
      scope: optionalString(body.scope) === "all" ? "all" : "active",
    });
    const payload = JSON.stringify(result);
    recordRouteResponse(ROUTE, Buffer.byteLength(payload), true);
    return apiJsonBody(payload);
  } catch (error) {
    recordRouteResponse(ROUTE, 0, false);
    throw error;
  }
}
