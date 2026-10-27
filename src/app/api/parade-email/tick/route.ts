import { NextResponse } from "next/server";

import {
  API_NO_STORE,
  apiSession,
  isApiRequest,
  unauthorized,
} from "@/lib/api/server";
import { maybeDispatchParadeEmail } from "@/lib/parade-email/actions";

/**
 * Lazy in-app trigger for the daily parade-state email (docs/parade-state-email.md).
 * Route handler so the opportunistic tick never waits behind (or blocks) a user
 * action. The send itself is idempotent and runs inside `after()`.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isApiRequest(request)) {
    return unauthorized();
  }
  const session = await apiSession();
  if (!session) {
    return unauthorized();
  }

  await maybeDispatchParadeEmail();
  return NextResponse.json({ ok: true }, { headers: API_NO_STORE });
}
