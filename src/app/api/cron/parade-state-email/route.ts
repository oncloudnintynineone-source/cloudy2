import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { runParadeStateEmail } from "@/lib/parade-email/dispatch";

/**
 * Daily parade-state email tick. Cloud Scheduler calls this on a short interval
 * with an `Authorization: Bearer <CRON_SECRET>` header; the dispatcher decides
 * whether the in-app send time has passed and claims the day, so repeated ticks
 * send at most once. See docs/parade-state-email.md.
 */
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const provided = Buffer.from(token);
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = await runParadeStateEmail({ trigger: "cron" });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
