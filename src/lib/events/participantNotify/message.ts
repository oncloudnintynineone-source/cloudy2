/**
 * Pure builder for the participant-invite push notification's human text.
 * Rendering is kept here (I/O-free, unit-tested) so the dispatch path only
 * resolves recipients + subscriptions and hands each one a ready-made payload.
 * Times reuse the audit log's UTC+8 wall-clock formatter (`formatEventAuditTime`)
 * so a notification reads exactly like the event's audit "time" string.
 */

import { formatEventAuditTime, type EventTimeParts } from "@/lib/events/eventAudit";

/** Whether the notification follows a create (whole event is new) or an
 *  update where the user was newly added to an existing event. */
export type ParticipantNotifyReason = "created" | "added";

export interface ParticipantNotification {
  /** The notification headline (event title when one exists). */
  title: string;
  /** The notification body (why + when [+ where]). */
  body: string;
}

/** Fallback headline when the event has no rendered title. */
function fallbackHeadline(reason: ParticipantNotifyReason): string {
  return reason === "created" ? "New event" : "Event update";
}

/**
 * Build the { title, body } shown by the OS. `title` is the rendered Google
 * Calendar title when one exists (types that hide the remarks field can save
 * blank titles); `body` leads with the inclusion phrasing, then the event's
 * wall-clock window and optional location.
 */
export function buildParticipantNotification(input: {
  reason: ParticipantNotifyReason;
  /** The rendered event title (may be blank/whitespace). */
  title: string;
  /** The event type name, used as a secondary headline fallback. */
  eventType: string;
  /** The event's naive datetime parts for the UTC+8 wall-clock string. */
  timeParts: EventTimeParts;
  /** The optional location (in/out-of-camp place). */
  location: string | null;
}): ParticipantNotification {
  const title =
    input.title.trim() || input.eventType.trim() || fallbackHeadline(input.reason);
  const time = formatEventAuditTime(input.timeParts);
  const location = input.location?.trim();
  const lead =
    input.reason === "created"
      ? "You're included in a new event"
      : "You've been added to this event";
  return {
    title,
    body: [lead, time, location || null].filter((part): part is string => Boolean(part)).join(" · "),
  };
}
