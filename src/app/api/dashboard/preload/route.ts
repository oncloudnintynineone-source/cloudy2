import { preloadDashboardTabs } from "@/lib/dashboard/actions";
import { apiJson, optionalString, withApiJson } from "@/lib/api/server";

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
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const result = await preloadDashboardTabs({
    view: optionalString(body.view),
    month: optionalString(body.month),
    date: optionalString(body.date),
    adjacentOnly: body.adjacentOnly === true,
    scope: optionalString(body.scope) === "all" ? "all" : "active",
  });
  return apiJson(result);
}
