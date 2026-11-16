import { NextResponse } from "next/server";

import { API_NO_STORE } from "@/lib/api/server";
import { buildWidgetAgenda } from "@/lib/widgets/agenda";
import { authenticateWidgetRequest } from "@/lib/widgets/auth";
import { clampWidgetDays } from "@/lib/widgets/shape";

/**
 * Read-only widget agenda (KWGT first; the same shape works for Scriptable /
 * Widgy later).
 *
 * Auth: `Authorization: Bearer <token>` or `?token=<token>` — KWGT's `wg()` /
 * Flow WebGet cannot set headers, so the query form is the Android path.
 *
 * Params: `view` (dashboard view id or kind; default = first tab) and `days`
 * (1–14, default 7). Widgets refresh only when the user taps their refresh
 * button, so every read uses the normal events cache — no forced Google fetch.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authenticateWidgetRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const rawView = url.searchParams.get("view");
  const view = rawView && rawView.trim() ? rawView.trim() : null;
  const days = clampWidgetDays(url.searchParams.get("days"));
  const origin = process.env.NEXTAUTH_URL?.trim().replace(/\/+$/, "") || url.origin;

  try {
    const payload = await buildWidgetAgenda({
      actor: auth.actor,
      view,
      days,
      origin,
    });
    return NextResponse.json(payload, { headers: API_NO_STORE });
  } catch (error) {
    console.error("[widgets] Agenda read failed", error);
    return NextResponse.json(
      { ok: false, error: "Could not load widget data" },
      { status: 500, headers: API_NO_STORE },
    );
  }
}
