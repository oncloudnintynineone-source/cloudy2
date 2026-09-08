/**
 * DB access for browser Web Push subscriptions (rows in `push_subscriptions`).
 * A subscription is a (device × browser) push endpoint owned by the roster
 * account signed in on it; one user can have many rows. Because the endpoint is
 * unique, a device shared by two accounts is re-`userId`d to the currently
 * signed-in account on every sync (see the server actions) so no account's
 * pushes leak to a device now used by another account.
 */

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { pushSubscriptions, type PushSubscription } from "@/db/schema";
import { onlyUuidIds } from "@/lib/uuid";

/** The subscription's encryption keys as the browser sends them. */
export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

/** A stored push subscription with its keys validated/decoded. */
export interface StoredPushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  keys: PushSubscriptionKeys;
}

/** Decode the JSONB `keys` column; null when malformed or missing strings. */
function decodeKeys(raw: unknown): PushSubscriptionKeys | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const p256dh = record.p256dh;
  const auth = record.auth;
  if (typeof p256dh !== "string" || !p256dh || typeof auth !== "string" || !auth) {
    return null;
  }
  return { p256dh, auth };
}

function toStored(row: PushSubscription): StoredPushSubscription | null {
  const keys = decodeKeys(row.keys);
  if (!keys) {
    return null;
  }
  return { id: row.id, userId: row.userId, endpoint: row.endpoint, keys };
}

/** All stored subscriptions belonging to the given user ids, keys decoded. */
export async function listSubscriptionsByUserIds(
  userIds: readonly string[],
): Promise<StoredPushSubscription[]> {
  const ids = onlyUuidIds([...new Set(userIds)]);
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, ids));
  const out: StoredPushSubscription[] = [];
  for (const row of rows) {
    const stored = toStored(row);
    if (stored) {
      out.push(stored);
    }
  }
  return out;
}

/** One endpoint row owned by `userId`, keys decoded; null when absent. */
export async function findSubscriptionByEndpoint(
  userId: string,
  endpoint: string,
): Promise<StoredPushSubscription | null> {
  const [row] = await db
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .limit(1);
  return row ? toStored(row) : null;
}

/**
 * Record (or re-own) one endpoint for the given user. Upsert-by-endpoint so
 * re-subscribing after an SW update updates the keys in place, and signing in
 * with a different account on the same device reassigns the row to that
 * account (the previous owner's row for this endpoint is replaced).
 */
export async function upsertPushSubscription(
  userId: string,
  endpoint: string,
  keys: PushSubscriptionKeys,
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint, keys })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, keys, updatedAt: new Date() },
    });
}

/** Remove one subscription row by its endpoint (e.g. on unsubscribe). */
export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  if (!endpoint) {
    return;
  }
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

/** Remove one subscription row by id (dead endpoint cleanup on 404/410). */
export async function deletePushSubscriptionById(id: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
}
