import { NextResponse } from "next/server";

import { API_NO_STORE, apiSession, unauthorized } from "@/lib/api/server";
import { fetchPinnedEvents } from "@/lib/events/pinned";

/**
 * Upcoming pinned events for the header ticker and panel. Read route (not a
 * server action) so its mount/refocus/CRUD refreshes stay out of the action
 * queue. The server keeps its own 60s in-memory TTL; mutations invalidate it.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await apiSession();
  if (!session) {
    return unauthorized();
  }

  try {
    const events = await fetchPinnedEvents();
    return NextResponse.json({ ok: true, events }, { headers: API_NO_STORE });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load pinned events" },
      { status: 500, headers: API_NO_STORE },
    );
  }
}
