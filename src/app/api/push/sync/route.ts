import { NextResponse } from "next/server";

import {
  API_NO_STORE,
  apiSession,
  isApiRequest,
  readApiJson,
  unauthorized,
} from "@/lib/api/server";
import {
  syncPushSubscription,
  type ClientPushSubscription,
} from "@/lib/events/participantNotify/actions";

/**
 * Self-heal sync for this device's Web Push subscription (the shell's
 * background repair). A route handler rather than a server action so the
 * once-per-hour background upsert never queues ahead of the user's next action.
 * The UI's explicit subscribe/unsubscribe still use the server actions.
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

  const body = await readApiJson<ClientPushSubscription>(request);
  if (body === null) {
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400, headers: API_NO_STORE },
    );
  }

  const result = await syncPushSubscription(body);
  return NextResponse.json(result, { headers: API_NO_STORE });
}
