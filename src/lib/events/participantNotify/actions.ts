"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import {
  deletePushSubscriptionByEndpoint,
  upsertPushSubscription,
} from "./subscriptions";

export type ParticipantPushSettings = {
  ok: true;
  /** The per-profile master switch (default true when no row exists yet). */
  eventInvitePush: boolean;
  /** Whether the signed-in account can own push subscriptions (the phone-less
   *  break-glass admin has no `users` row and cannot). */
  canSubscribe: boolean;
};

/**
 * Read the signed-in user's participant-notification preference. The
 * `user_preferences` row is lazily ensured elsewhere; an absent row means the
 * default (enabled). Never throws.
 */
export async function getParticipantPushSettings(): Promise<ParticipantPushSettings> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: true, eventInvitePush: false, canSubscribe: false };
  }
  const [row] = await db
    .select({ eventInvitePush: userPreferences.eventInvitePush })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return { ok: true, eventInvitePush: row?.eventInvitePush ?? true, canSubscribe: true };
}

export type ParticipantPushActionResult = { ok: true } | { ok: false; error: string };

/**
 * Persist the per-profile master switch for event participant notifications.
 * The row is created on first write with the default true.
 */
export async function setEventInvitePush(
  enabled: boolean,
): Promise<ParticipantPushActionResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: true };
  }
  await db
    .insert(userPreferences)
    .values({ userId, eventInvitePush: enabled })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { eventInvitePush: enabled, updatedAt: new Date() },
    });
  return { ok: true };
}

export interface ClientPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Minimal shape validation for a browser PushSubscription before storing. */
function validSubscription(input: ClientPushSubscription): boolean {
  if (!input || typeof input !== "object") {
    return false;
  }
  const endpoint = input.endpoint;
  if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint)) {
    return false;
  }
  const keys = input.keys;
  if (!keys || typeof keys !== "object") {
    return false;
  }
  return (
    typeof keys.p256dh === "string" &&
    keys.p256dh.length > 0 &&
    typeof keys.auth === "string" &&
    keys.auth.length > 0
  );
}

/**
 * Record (or re-own) this device's push subscription for the signed-in user.
 * Idempotent: calling again after an SW update upserts the keys; calling after
 * a different account signs in reassigns the endpoint row to the new account
 * (see `subscriptions.ts`).
 */
export async function syncPushSubscription(
  input: ClientPushSubscription,
): Promise<ParticipantPushActionResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: true };
  }
  if (!validSubscription(input)) {
    return { ok: false, error: "Invalid push subscription" };
  }
  await upsertPushSubscription(userId, input.endpoint, input.keys);
  return { ok: true };
}

/**
 * Forget this device's push subscription (called when the browser reports
 * permission denied or the user unsubscribes through the UI). The endpoint
 * row, if any, belongs to the currently signed-in account by construction of
 * {@link syncPushSubscription}.
 */
export async function unsyncPushSubscription(
  endpoint: string,
): Promise<ParticipantPushActionResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: true };
  }
  if (typeof endpoint !== "string" || !endpoint) {
    return { ok: true };
  }
  await deletePushSubscriptionByEndpoint(endpoint);
  return { ok: true };
}
