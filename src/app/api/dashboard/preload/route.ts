import { NextResponse } from "next/server";

import { preloadDashboardTabs } from "@/lib/dashboard/actions";
import {
  API_NO_STORE,
  apiSession,
  isApiRequest,
  optionalString,
  readApiJson,
  unauthorized,
} from "@/lib/api/server";

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
}

export async function POST(request: Request) {
  if (!isApiRequest(request)) {
    return unauthorized();
  }
  const session = await apiSession();
  if (!session) {
    return unauthorized();
  }

  const body = await readApiJson<PreloadBody>(request);
  if (body === null) {
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400, headers: API_NO_STORE },
    );
  }

  const result = await preloadDashboardTabs({
    view: optionalString(body.view),
    month: optionalString(body.month),
    date: optionalString(body.date),
  });
  return NextResponse.json(result, { headers: API_NO_STORE });
}
