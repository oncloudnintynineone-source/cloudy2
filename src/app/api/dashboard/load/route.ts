import { NextResponse } from "next/server";

import { loadDashboardData } from "@/lib/dashboard/actions";
import {
  API_NO_STORE,
  apiSession,
  isApiRequest,
  optionalString,
  readApiJson,
  unauthorized,
} from "@/lib/api/server";

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
  if (!isApiRequest(request)) {
    return unauthorized();
  }
  const session = await apiSession();
  if (!session) {
    return unauthorized();
  }

  const body = await readApiJson<LoadBody>(request);
  if (body === null) {
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400, headers: API_NO_STORE },
    );
  }

  const result = await loadDashboardData({
    view: optionalString(body.view),
    month: optionalString(body.month),
    date: optionalString(body.date),
    refresh: optionalString(body.refresh),
  });
  return NextResponse.json(result, { headers: API_NO_STORE });
}
