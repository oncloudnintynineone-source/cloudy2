/**
 * Pure helpers that build realistic EXAMPLE webhook payloads for the in-app
 * integration guide (Settings → Webhooks). The examples are assembled by
 * calling the real {@link buildEventWebhookPayload} with fixed fixture data,
 * so the displayed schema can never drift from what deliveries actually
 * carry: any future payload change automatically updates the shown examples.
 */

import {
  buildEventSnapshot,
  type EventSnapshotNames,
  type EventTimeParts,
} from "@/lib/events/eventAudit";
import {
  buildEventWebhookPayload,
  WEBHOOK_ACTIONS,
  type WebhookAction,
} from "./payload";

const NAMES: EventSnapshotNames = {
  departmentNames: { dept: "Alpha" },
  userNames: { "user-1": "Alice Tan", "user-2": "Bob Lim" },
};

const TIME_PARTS: EventTimeParts = {
  timeOption: "half",
  start: "2026-08-21 00:00:00",
  end: "2026-08-23 00:00:00",
  startAmPm: "AM",
  endAmPm: "PM",
};

function snapshot() {
  return buildEventSnapshot({
    title: "Range Alpha",
    description: "Field training",
    type: "Exercise",
    timeParts: TIME_PARTS,
    outOfCamp: true,
    overseas: true,
    location: "Range North",
    departmentIds: ["dept"],
    inviteeUserIds: ["user-2", "user-1"],
    creatorId: "user-1",
    names: NAMES,
  });
}

/**
 * Example payload for one webhook action, JSON-stringified for display.
 * Deterministic: identical inputs always render the identical string.
 */
export function buildExampleWebhookPayload(action: WebhookAction): string {
  const updated = action === WEBHOOK_ACTIONS.eventUpdated;
  const payload = buildEventWebhookPayload({
    action,
    eventId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    googleEventIds:
      action === WEBHOOK_ACTIONS.eventDeleted ? ["abc123"] : ["gcal_abc123", "gcal_def456"],
    snapshot: snapshot(),
    // A deleted legacy event has no recoverable structured times; created and
    // updated payloads carry them.
    timeParts: action === WEBHOOK_ACTIONS.eventDeleted ? null : TIME_PARTS,
    changes: updated
      ? {
          location: ["Range North", "Range South"],
          time: ["2026-08-21 (AM)", "2026-08-21 (AM) \u2013 2026-08-23 (PM)"],
        }
      : null,
    actor: { name: "Alice Tan", role: "admin" },
    occurredAt: new Date(0),
  });
  return JSON.stringify(payload, null, 2);
}
