import { NextResponse } from "next/server";

import { resolveDeepLinkTargetAction } from "@/lib/dashboard/deepLinkActions";
import {
  API_NO_STORE,
  apiSession,
  isApiRequest,
  optionalString,
  readApiJson,
  unauthorized,
} from "@/lib/api/server";

/**
 * Lean `?event=`/`?edit=` target resolution, run alongside the grid read so a
 * pinned/search/share link opens without waiting on (or queueing behind) the
 * full snapshot. Route handler for the same queue-avoidance reason as
 * `/api/dashboard/load`.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface DeepLinkBody {
  eventId?: unknown;
  date?: unknown;
  calendarId?: unknown;
  view?: unknown;
  viewKind?: unknown;
  force?: unknown;
}

export async function POST(request: Request) {
  if (!isApiRequest(request)) {
    return unauthorized();
  }
  const session = await apiSession();
  if (!session) {
    return unauthorized();
  }

  const body = await readApiJson<DeepLinkBody>(request);
  const eventId = optionalString(body?.eventId);
  if (body === null || !eventId) {
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400, headers: API_NO_STORE },
    );
  }

  const result = await resolveDeepLinkTargetAction({
    eventId,
    date: optionalString(body.date),
    calendarId: optionalString(body.calendarId),
    view: optionalString(body.view),
    viewKind: optionalString(body.viewKind),
    force: body.force === true,
  });
  return NextResponse.json(result, { headers: API_NO_STORE });
}
