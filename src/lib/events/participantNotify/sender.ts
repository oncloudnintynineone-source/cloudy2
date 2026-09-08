/**
 * Shared one-shot Web Push send used by the event participant dispatcher
 * (`notify.ts`) and the profile dialog's "Send test notification". Resolves on
 * every outcome — callers decide what to do with a dead endpoint (404/410) vs
 * a transient failure. `web-push` is imported lazily so nothing about the
 * library enters the client bundle or any eager server chunk.
 */

import type { StoredPushSubscription } from "./subscriptions";
import type { VapidConfig } from "./vapid";

export type PushSendResult =
  | { ok: true }
  | { ok: false; gone: boolean; statusCode: number | null; message: string };

const PUSH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days: an invite still matters a few days out
const PUSH_TIMEOUT_MS = 10_000;

/**
 * Send one small JSON payload to one subscription. Never throws: any failure is
 * returned as `{ ok: false }` with a `gone: true` marker for 404/410 (the push
 * service no longer knows the endpoint) and a numeric `statusCode` when the
 * push service answered.
 */
export async function sendPush(
  config: VapidConfig,
  subscription: StoredPushSubscription,
  payload: Record<string, string>,
): Promise<PushSendResult> {
  try {
    const webpush = (await import("web-push")).default;
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload),
      {
        TTL: PUSH_TTL_SECONDS,
        timeout: PUSH_TIMEOUT_MS,
        vapidDetails: config,
      },
    );
    return { ok: true };
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode ?? null;
    if (statusCode === 404 || statusCode === 410) {
      return {
        ok: false,
        gone: true,
        statusCode,
        message: "This device's subscription is no longer registered with the push service.",
      };
    }
    return {
      ok: false,
      gone: false,
      statusCode,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
