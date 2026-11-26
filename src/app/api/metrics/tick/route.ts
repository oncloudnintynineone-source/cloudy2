import { after } from "next/server";

import { apiJson, withApiSession } from "@/lib/api/server";
import { maybeRunMetricsSnapshot } from "@/lib/metrics/snapshot";

/**
 * Lazy in-app trigger for the daily resource-usage snapshot
 * (src/lib/metrics/snapshot.ts). A route handler so the opportunistic tick
 * never waits behind — or blocks — a user action; the pass itself runs in
 * `after()`, is gated by a pure window check, and is claimed once per day, so
 * concurrent opens from several devices are harmless.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await withApiSession(request, { requireApiHeader: true });
  if (!auth.ok) {
    return auth.response;
  }

  after(() => maybeRunMetricsSnapshot());
  return apiJson({ ok: true });
}
