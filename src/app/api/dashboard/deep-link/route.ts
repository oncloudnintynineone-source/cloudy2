import { resolveDeepLinkTargetAction } from "@/lib/dashboard/deepLinkActions";
import { apiError, apiJson, optionalString, withApiJson } from "@/lib/api/server";

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
  const auth = await withApiJson<DeepLinkBody>(request);
  if (!auth.ok) {
    return auth.response;
  }
  const body = auth.body;
  const eventId = optionalString(body.eventId);
  if (!eventId) {
    return apiError(400, "Invalid request");
  }

  const result = await resolveDeepLinkTargetAction({
    eventId,
    date: optionalString(body.date),
    calendarId: optionalString(body.calendarId),
    view: optionalString(body.view),
    viewKind: optionalString(body.viewKind),
    force: body.force === true,
  });
  return apiJson(result);
}
