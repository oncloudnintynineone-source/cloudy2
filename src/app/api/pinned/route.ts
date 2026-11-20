import { apiError, apiJson, withApiSession } from "@/lib/api/server";
import { fetchPinnedEvents } from "@/lib/events/pinned";

/**
 * Upcoming pinned events for the header ticker and panel. Read route (not a
 * server action) so its mount/refocus/CRUD refreshes stay out of the action
 * queue. The server keeps its own 60s in-memory TTL; mutations invalidate it.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await withApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const events = await fetchPinnedEvents();
    return apiJson({ ok: true, events });
  } catch {
    return apiError(500, "Could not load pinned events");
  }
}
