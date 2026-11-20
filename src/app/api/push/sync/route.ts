import { apiJson, withApiJson } from "@/lib/api/server";
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
  const auth = await withApiJson<ClientPushSubscription>(request);
  if (!auth.ok) {
    return auth.response;
  }

  const result = await syncPushSubscription(auth.body);
  return apiJson(result);
}
