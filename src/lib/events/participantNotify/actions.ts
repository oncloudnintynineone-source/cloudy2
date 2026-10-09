"use server";

import { eq } from "drizzle-orm";

import { appBaseUrl } from "@/lib/appUrl";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import {
  deletePushSubscriptionByEndpoint,
  findSubscriptionByEndpoint,
  upsertPushSubscription,
} from "./subscriptions";
import { isValidClientSubscription, type ClientPushSubscription } from "./subscriptionInput";
import { sendPush } from "./sender";
import { parseVapidConfig } from "./vapid";

export interface ParticipantPushSettings {
  /** False when the server read failed (`error` explains why). */
  ok: boolean;
  /** The per-profile master switch (default true when no row exists yet). */
  eventInvitePush: boolean;
  /** Whether the signed-in account can own push subscriptions (the phone-less
   *  break-glass admin has no `users` row and cannot). */
  canSubscribe: boolean;
  /** Whether the server has the VAPID env trio needed to send. */
  serverPushEnabled: boolean;
  /** A human-readable failure reason when `ok` is false. */
  error?: string;
}

/** Best-effort DB error → a human message (never exposes raw SQL). */
function dbErrorHint(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/push_subscriptions/.test(message) && /does not exist/.test(message)) {
    return "Notifications aren't ready yet — the push_subscriptions table is missing (run the database migrations).";
  }
  if (/event_invite_push/.test(message) && /does not exist/.test(message)) {
    return "Notifications aren't ready yet — the settings update hasn't been migrated to this database.";
  }
  return "Couldn't reach the database — please try again.";
}

/**
 * Read the signed-in user's participant-notification preference. The
 * `user_preferences` row is lazily ensured elsewhere; an absent row means the
 * default (enabled). Never throws.
 */
export async function getParticipantPushSettings(): Promise<ParticipantPushSettings> {
  const session = await requireSession();
  const userId = session.user.id;
  const serverPushEnabled = parseVapidConfig() !== null;
  if (!isUuid(userId)) {
    return { ok: true, eventInvitePush: false, canSubscribe: false, serverPushEnabled };
  }
  try {
    const [row] = await db
      .select({ eventInvitePush: userPreferences.eventInvitePush })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    return {
      ok: true,
      eventInvitePush: row?.eventInvitePush ?? true,
      canSubscribe: true,
      serverPushEnabled,
    };
  } catch (error) {
    console.error("[push] Failed to read participant push settings", error);
    return {
      ok: false,
      eventInvitePush: true,
      canSubscribe: true,
      serverPushEnabled,
      error: dbErrorHint(error),
    };
  }
}

export type ParticipantPushActionResult = { ok: true } | { ok: false; error: string };

/**
 * Persist the per-profile master switch for event participant notifications.
 * The row is created on first write with the default true. Never throws.
 */
export async function setEventInvitePush(
  enabled: boolean,
): Promise<ParticipantPushActionResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: true };
  }
  try {
    await db
      .insert(userPreferences)
      .values({ userId, eventInvitePush: enabled })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { eventInvitePush: enabled, updatedAt: new Date() },
      });
    return { ok: true };
  } catch (error) {
    console.error("[push] Failed to persist event-invite push setting", error);
    return { ok: false, error: dbErrorHint(error) };
  }
}

export type { ClientPushSubscription } from "./subscriptionInput";

/**
 * Record (or re-own) this device's push subscription for the signed-in user.
 * Idempotent: calling again after an SW update upserts the keys; calling after
 * a different account signs in reassigns the endpoint row to the new account
 * (see `subscriptions.ts`). Never throws.
 */
export async function syncPushSubscription(
  input: ClientPushSubscription,
): Promise<ParticipantPushActionResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: true };
  }
  if (!isValidClientSubscription(input)) {
    return { ok: false, error: "Invalid push subscription" };
  }
  try {
    await upsertPushSubscription(userId, input.endpoint, input.keys);
    return { ok: true };
  } catch (error) {
    console.error("[push] Failed to sync push subscription", error);
    return { ok: false, error: dbErrorHint(error) };
  }
}

/**
 * Forget this device's push subscription (called when the browser reports
 * permission denied or the user unsubscribes through the UI). The endpoint
 * row, if any, belongs to the currently signed-in account by construction of
 * {@link syncPushSubscription}. Never throws.
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
  try {
    await deletePushSubscriptionByEndpoint(endpoint);
    return { ok: true };
  } catch (error) {
    console.error("[push] Failed to remove push subscription", error);
    return { ok: false, error: dbErrorHint(error) };
  }
}

export type TestPushResult = { ok: true } | { ok: false; error: string };

/**
 * Send one test notification to this device through the exact same path event
 * participant notifications use (VAPID config → `web-push`). Used by the
 * profile dialog's "Send test" so a config/subscription problem surfaces
 * immediately instead of a silent miss.
 */
export async function sendTestPush(endpoint: string): Promise<TestPushResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!isUuid(userId)) {
    return { ok: false, error: "This account can't receive notifications" };
  }
  if (typeof endpoint !== "string" || !endpoint) {
    return { ok: false, error: "No device subscription found — enable notifications first" };
  }
  const config = parseVapidConfig();
  if (!config) {
    return {
      ok: false,
      error:
        "Push isn't configured on the server yet — the VAPID environment variables are missing (ask an admin).",
    };
  }
  let subscription;
  try {
    subscription = await findSubscriptionByEndpoint(userId, endpoint);
  } catch (error) {
    console.error("[push] Failed to look up subscription for test", error);
    return { ok: false, error: "Couldn't look up this device's subscription — try again." };
  }
  if (!subscription) {
    return { ok: false, error: "No subscription saved for this device — enable notifications first" };
  }
  const baseUrl = await appBaseUrl();
  const result = await sendPush(config, subscription, {
    title: "Cloudy2 — test notification",
    body: "If you see this, event notifications are working on this device.",
    tag: "cloudy2-test",
    url: `${baseUrl}/dashboard`,
  });
  if (result.ok) {
    return { ok: true };
  }
  if (result.gone) {
    await deletePushSubscriptionByEndpoint(endpoint).catch(() => undefined);
    return {
      ok: false,
      error: "This device's subscription is no longer registered — tap Enable notifications again.",
    };
  }
  if (result.statusCode === 403 || result.statusCode === 401) {
    return {
      ok: false,
      error:
        `The push service rejected the request (HTTP ${result.statusCode}) — the server's VAPID keys ` +
        "don't match the key this device subscribed with (the key pair changed?). " +
        "Turn notifications off and on again on this device.",
    };
  }
  return {
    ok: false,
    error: `Couldn't send the test notification (${result.statusCode ? `HTTP ${result.statusCode}` : "network error"}).`,
  };
}
