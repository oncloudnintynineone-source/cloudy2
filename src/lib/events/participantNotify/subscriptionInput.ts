/**
 * Pure, I/O-free shape validation for a browser `PushSubscription` serialized
 * for transport (the object `subscription.toJSON()` produces). Shared by the
 * subscribe/repair server action (`actions.ts`) and the service worker's
 * `pushsubscriptionchange` route (`/api/push/subscription`), and unit-tested in
 * isolation — it must never import the DB or any server-only module.
 */

/** A subscription's encryption keys as the browser sends them. */
export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

/** A browser PushSubscription serialized for transport to the server. */
export interface ClientPushSubscription {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

/**
 * Minimal shape validation for a browser PushSubscription before storing it:
 * an https endpoint and non-empty `p256dh`/`auth` strings. Anything else is
 * rejected rather than persisted.
 */
export function isValidClientSubscription(input: unknown): input is ClientPushSubscription {
  if (!input || typeof input !== "object") {
    return false;
  }
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: unknown };
  if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint)) {
    return false;
  }
  if (!keys || typeof keys !== "object") {
    return false;
  }
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  return (
    typeof p256dh === "string" &&
    p256dh.length > 0 &&
    typeof auth === "string" &&
    auth.length > 0
  );
}
