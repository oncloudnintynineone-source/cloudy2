import { preloadDashboardTabs } from "@/lib/dashboard/actions";
import { apiJson, optionalString, withApiJson } from "@/lib/api/server";

/**
 * Background tab preload (docs/pwa-offline.md §1.18). A route handler so the
 * pass is a plain fetch the client can cancel or ignore — never a queued server
 * action competing with the user's next save/read.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PreloadBody {
  view?: unknown;
  month?: unknown;
  date?: unknown;
  adjacentOnly?: unknown;
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
  });
  return apiJson(result);
}
