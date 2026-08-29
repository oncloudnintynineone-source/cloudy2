/**
 * Pure helpers that build the outbound webhook payload notifying external
 * systems of event create/update/delete. The payload reuses the same
 * `EventAuditSnapshot` the audit log stores — display names resolved, never
 * raw ids for people/departments — plus machine-friendly structured fields
 * (the logical group id, per-copy Google event ids, naive UTC+8 datetimes).
 * Kept free of I/O so it is unit-testable without a database or network.
 */

import type { EventAuditSnapshot, EventTimeParts } from "@/lib/events/eventAudit";

export const WEBHOOK_ACTIONS = {
  eventCreated: "event.created",
  eventUpdated: "event.updated",
  eventDeleted: "event.deleted",
} as const;

export type WebhookAction = (typeof WEBHOOK_ACTIONS)[keyof typeof WEBHOOK_ACTIONS];

/** Everything an external system needs to mirror one event mutation. */
export interface EventWebhookInput {
  action: WebhookAction;
  /**
   * The logical group id shared by all department copies of the event; null
   * for legacy events that were deleted before their first edit.
   */
  eventId: string | null;
  /** Google event ids touched by the mutation (one per department copy). */
  googleEventIds: string[];
  /** Human-readable snapshot (rendered title, names, pre-formatted time). */
  snapshot: EventAuditSnapshot;
  /**
   * Structured datetime parts behind the snapshot's formatted `time` string.
   * Null when they cannot be recovered (e.g. deleting a legacy event whose
   * notes carry no time option) — the structured keys are then omitted and
   * consumers fall back to `event.time`.
   */
  timeParts: EventTimeParts | null;
  /**
   * Fields changed by an update as `[before, after]` pairs (same shape as the
   * audit log's diff). Null for create/delete.
   */
  changes: Record<string, [unknown, unknown]> | null;
  /** Who performed the mutation. */
  actor: { name: string | null; role: string };
  /** When the mutation happened. */
  occurredAt: Date;
}

/** The full JSON body POSTed to the configured webhook URL. */
export interface EventWebhookPayload {
  action: WebhookAction;
  eventId: string | null;
  googleEventIds: string[];
  /** ISO instant of the mutation. */
  occurredAt: string;
  actor: { name: string | null; role: string };
  event: {
    title: string | null;
    description: string | null;
    type: string | null;
    time: string;
    outOfCamp: boolean;
    overseas: boolean;
    location: string | null;
    departments: string[];
    invitees: string[];
    creator: string | null;
    timeOption?: TimeOptionName;
    start?: string;
    end?: string;
    startAmPm?: AmPmName | null;
    endAmPm?: AmPmName | null;
  };
  changes?: Record<string, [unknown, unknown]>;
}

type TimeOptionName = EventTimeParts["timeOption"];
type AmPmName = EventTimeParts["startAmPm"];

/**
 * Build the JSON-ready webhook payload. Structured datetime keys are added
 * only when `timeParts` is available; `changes` is included only for updates.
 */
export function buildEventWebhookPayload(input: EventWebhookInput): EventWebhookPayload {
  const event: EventWebhookPayload["event"] = {
    title: input.snapshot.title,
    description: input.snapshot.description,
    type: input.snapshot.type,
    time: input.snapshot.time,
    outOfCamp: input.snapshot.outOfCamp,
    overseas: input.snapshot.overseas,
    location: input.snapshot.location,
    departments: [...input.snapshot.departments],
    invitees: [...input.snapshot.invitees],
    creator: input.snapshot.creator,
  };

  if (input.timeParts) {
    event.timeOption = input.timeParts.timeOption;
    event.start = input.timeParts.start;
    event.end = input.timeParts.end;
    event.startAmPm = input.timeParts.startAmPm || null;
    event.endAmPm = input.timeParts.endAmPm || null;
  }

  return {
    action: input.action,
    eventId: input.eventId,
    googleEventIds: [...input.googleEventIds],
    occurredAt: input.occurredAt.toISOString(),
    actor: { name: input.actor.name, role: input.actor.role },
    event,
    ...(input.changes ? { changes: input.changes } : {}),
  };
}
