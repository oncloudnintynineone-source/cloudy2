import { apiError, apiJson } from "@/lib/api/server";
import {
  deletePushSubscriptionForUser,
  upsertPushSubscription,
} from "@/lib/events/participantNotify/subscriptions";
import { isValidClientSubscription } from "@/lib/events/participantNotify/subscriptionInput";
import { getSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

/**
 * Reconciles this browser's push subscription for the signed-in account after
 * the service worker's `pushsubscriptionchange` event (`src/app/sw.ts`).
 *
 * A browser or push service may refresh/rotate a subscription at any time; the
 * SW forwards the browser's current endpoint here (the fetch carries the
 * session cookie) so the server can drop the dead endpoint and store the new
 * one — without waiting for the user to reopen the Notifications dialog. When
 * the browser could not mint a replacement (`subscription: null`), only the
 * dead endpoint is removed; the app shell's repair hook re-subscribes on the
 * next open.
 *
 * A plain route handler (not a server action) because the service worker
 * cannot invoke a "use server" action. Best-effort: every branch returns JSON
 * and never throws.
 */
export const dynamic = "force-dynamic";

interface ReconcileBody {
  subscription?: unknown;
  oldEndpoint?: unknown;
}

export async function POST(request: Request) {
  let body: ReconcileBody;
  try {
    body = (await request.json()) as ReconcileBody;
  } catch {
    return apiError(400, "Invalid JSON body");
  }

  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId || !isUuid(userId)) {
    return apiError(401, "Unauthorized");
  }

  const oldEndpoint =
    typeof body.oldEndpoint === "string" && body.oldEndpoint ? body.oldEndpoint : null;
  const subscription = body.subscription;

  try {
    if (subscription === null) {
      if (oldEndpoint) {
        await deletePushSubscriptionForUser(userId, oldEndpoint);
      }
      return apiJson({ ok: true });
    }
    if (!isValidClientSubscription(subscription)) {
      return apiError(400, "Invalid push subscription");
    }
    if (oldEndpoint && oldEndpoint !== subscription.endpoint) {
      await deletePushSubscriptionForUser(userId, oldEndpoint);
    }
    await upsertPushSubscription(userId, subscription.endpoint, subscription.keys);
    return apiJson({ ok: true });
  } catch (error) {
    console.error("[push] Failed to reconcile push subscription", error);
    return apiError(500, "Server error");
  }
}
