/**
 * Fire-and-forget Web Push delivery when an event mutation adds participants.
 * Called from the create/update server actions (never delete — deletion frees
 * people, it adds nobody). The real work runs inside `after()` so the mutation
 * response is never delayed; everything is best-effort and any failure is
 * logged and swallowed, mirroring `dispatchKahBreachCheck` and the webhook
 * delivery. Sends only to roster users whose `userPreferences.eventInvitePush`
 * is on and who have a stored push subscription, never to the acting user.
 *
 * Payloads are small (title + body + deep-link URL); the service worker shows
 * them and opens the event's details on tap. Dead endpoints (HTTP 404/410)
 * prune the subscription row.
 */

import { after } from "next/server";

import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { userPreferences, users } from "@/db/schema";
import { AUDIT_ACTIONS } from "@/lib/audit/build";
import { logAction } from "@/lib/audit/log";
import type { EventTimeParts } from "@/lib/events/eventAudit";
import type { EventMutationCopy } from "@/lib/events/actions";
import { eventDetailUrl } from "@/lib/events/notes";
import { activeMembershipsByDepartment } from "@/lib/roster/queries";
import { onlyUuidIds } from "@/lib/uuid";
import { computeAddedUserIds, type ParticipantPeople } from "./diff";
import { buildParticipantNotification, type ParticipantNotifyReason } from "./message";
import {
  deletePushSubscriptionById,
  listSubscriptionsByUserIds,
  type StoredPushSubscription,
} from "./subscriptions";
import { parseVapidConfig } from "./vapid";

export interface ParticipantNotifyInput {
  /** Audit actor columns (the session user's; null id for the admin pseudo-account). */
  actorId: string | null;
  actorName: string | null;
  actorRole: string;
  /** The logical event's group id. */
  eventId: string;
  /** The rendered Google Calendar title (may be blank). */
  title: string;
  /** The event type name (may be blank). */
  eventType: string;
  /** The event's optional location. */
  location: string | null;
  /** The event's naive datetime parts (for the UTC+8 wall-clock text + deep link). */
  timeParts: EventTimeParts;
  /** Whether this is a create (whole event new) or an update (newly added). */
  reason: ParticipantNotifyReason;
  /** The pre-edit people (null on create — everyone is new). */
  before: ParticipantPeople | null;
  /** The post-save people (the event's effective participant set). */
  after: ParticipantPeople;
  /** The copies that exist post-save, per department calendar. */
  copies: EventMutationCopy[];
  /** Public app origin for the deep link (resolved before `after()`). */
  baseUrl: string;
}

interface RecipientUser {
  id: string;
  name: string;
  departmentId: string | null;
}

/** URL of the dashboard deep link for one recipient, on a copy their own
 *  department owns when possible (else the first copy). */
function recipientUrl(input: ParticipantNotifyInput, departmentId: string | null): string {
  const ownCopy = departmentId
    ? input.copies.find((copy) => copy.calendarId === departmentId)
    : undefined;
  const calendarId = ownCopy?.calendarId ?? input.copies[0]?.calendarId;
  if (!calendarId) {
    // No copies — fall back to a bare dashboard (the user will still land on
    // their default view; can't open a specific event without a calendar hint).
    return `${input.baseUrl}/dashboard`;
  }
  return eventDetailUrl(input.baseUrl, input.timeParts.start, input.eventId, calendarId);
}

/** Send one payload to one subscription; resolves on any outcome. */
async function sendToSubscription(
  config: NonNullable<ReturnType<typeof parseVapidConfig>>,
  subscription: StoredPushSubscription,
  payload: Record<string, string>,
): Promise<"sent" | "gone"> {
  try {
    const webpush = (await import("web-push")).default;
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload),
      {
        TTL: 7 * 24 * 60 * 60, // 7 days: an invite still matters a few days out
        timeout: 10_000,
        vapidDetails: config,
      },
    );
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      // Subscription no longer valid (device unsubscribed / push service
      // dropped it) — prune the row.
      await deletePushSubscriptionById(subscription.id).catch(() => undefined);
      return "gone";
    }
    console.error(`[push] Delivery to ${subscription.endpoint} failed`, error);
    return "sent";
  }
}

/** The after() body. Never throws — every failure is caught and logged. */
async function runParticipantNotify(input: ParticipantNotifyInput): Promise<void> {
  const config = parseVapidConfig();
  if (!config) {
    // Not configured (dev without VAPID keys): nothing to do.
    return;
  }

  const deptIds = [
    ...new Set([
      ...(input.before?.inviteeDepartments ?? []),
      ...(input.after?.inviteeDepartments ?? []),
    ]),
  ];
  const memberships = await activeMembershipsByDepartment(deptIds);
  const addedIds = computeAddedUserIds(input.before, input.after, memberships).filter(
    (id) => id && id !== input.actorId,
  );
  if (addedIds.length === 0) {
    return;
  }

  const userRows = await db
    .select({
      id: users.id,
      name: users.name,
      departmentId: users.departmentId,
      status: users.status,
    })
    .from(users)
    .where(inArray(users.id, onlyUuidIds(addedIds)));

  // Only currently-active roster users are notified (a deactivated user tagged
  // on a legacy event is not pinged).
  let recipients: RecipientUser[] = userRows
    .filter((row) => row.status === "active")
    .map((row) => ({ id: row.id, name: row.name, departmentId: row.departmentId }));
  if (recipients.length === 0) {
    return;
  }

  // Per-profile master switch: rows present with eventInvitePush = false opt
  // out app-wide; a missing row defaults to true.
  const enabledIds = onlyUuidIds(recipients.map((user) => user.id));
  const prefRows = await db
    .select({ userId: userPreferences.userId, eventInvitePush: userPreferences.eventInvitePush })
    .from(userPreferences)
    .where(inArray(userPreferences.userId, enabledIds));
  const optedOut = new Set(
    prefRows.filter((row) => row.eventInvitePush === false).map((row) => row.userId),
  );
  recipients = recipients.filter((user) => !optedOut.has(user.id));
  if (recipients.length === 0) {
    return;
  }

  const subscriptions = await listSubscriptionsByUserIds(recipients.map((user) => user.id));
  if (subscriptions.length === 0) {
    return;
  }

  const message = buildParticipantNotification({
    reason: input.reason,
    title: input.title,
    eventType: input.eventType,
    timeParts: input.timeParts,
    location: input.location,
  });

  // Audit first so the notification is on record even when a send fails.
  await logAction({
    actorId: input.actorId,
    actorName: input.actorName,
    actorRole: input.actorRole,
    action: AUDIT_ACTIONS.eventParticipantNotify,
    entityType: "calendar",
    entityId: input.copies[0]?.calendarId ?? null,
    entityName: message.title,
    method: "dispatchParticipantNotifications",
    details: {
      eventId: input.eventId,
      reason: input.reason,
      notified: recipients.length,
      devices: subscriptions.length,
      recipients: recipients.map((user) => user.name).join(", "),
    },
  });

  const byUser = new Map(recipients.map((user) => [user.id, user]));
  await Promise.allSettled(
    subscriptions.map((subscription) => {
      const user = byUser.get(subscription.userId);
      const url = recipientUrl(input, user?.departmentId ?? null);
      return sendToSubscription(config, subscription, {
        title: message.title,
        body: message.body,
        tag: input.eventId,
        url,
      });
    }),
  );
}

/**
 * Queue a participant notification for one successful create/update. Safe to
 * call on every successful create/update: with no newly-added people, no
 * enabled VAPID config, no opt-in recipients or no subscriptions it is a
 * no-op, and it never throws. Must be called after the Google copies are saved
 * (its reads run in `after()`).
 */
export function dispatchParticipantNotifications(input: ParticipantNotifyInput): void {
  after(async () => {
    try {
      await runParticipantNotify(input);
    } catch (error) {
      console.error("[push] Participant notification failed", error);
    }
  });
}
