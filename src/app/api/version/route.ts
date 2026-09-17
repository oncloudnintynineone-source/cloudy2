import { NextResponse } from "next/server";

import { APP_VERSION } from "@/lib/appVersion";

/**
 * The build version this server is currently serving. `SWUpdateNotice` polls
 * it (no-store) and compares it with the `APP_VERSION` baked into the running
 * client bundle: a mismatch means this page is stale and the "Update
 * available — Reload" pill should appear.
 *
 * Deliberately not derived from the service worker's `registration.waiting` —
 * iOS Safari can leave a waiting worker lingering (and reporting it) after the
 * new build is already running, which made the pill reappear forever. A live
 * server comparison is authoritative and side-effect free. Exposes no secrets.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { version: APP_VERSION },
    { headers: { "Cache-Control": "no-store" } },
  );
}
