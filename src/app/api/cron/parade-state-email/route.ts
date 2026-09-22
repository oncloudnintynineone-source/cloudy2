import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { runParadeStateEmail } from "@/lib/parade-email/dispatch";

/**
 * Daily parade-state email tick. Cloud Scheduler calls this with an
 * `Authorization: Bearer <CRON_SECRET>` header; the schedule (weekdays 08:00
 * Asia/Singapore) lives in the Cloud Scheduler job, not here. The dispatcher
 * claims the day via the unique `parade_email_sends.send_date`, so repeated
 * ticks send at most once.
 *
 * Both GET and POST are accepted: `gcloud scheduler jobs create http` defaults
 * to POST, and a job created without `--http-method=GET` would otherwise 405
 * on every tick (surfaced by Cloud Scheduler as `status.code` 2). GET is the
 * canonical method. See docs/parade-state-email.md.
 */
export const dynamic = "force-dynamic";
// node:crypto (timingSafeEqual) requires the Node runtime; explicit so a future
// edit can't silently move the route to the edge.
export const runtime = "nodejs";

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

async function handle(request: NextRequest) {
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

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
