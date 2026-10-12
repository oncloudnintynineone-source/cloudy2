/**
 * Pure helpers backing the per-user "My Events" list (docs/event-history.md).
 * An event's audit row stores its group id and a human-readable snapshot inside
 * the jsonb `details` column; these functions parse that payload into typed,
 * display-ready records without touching the database, so they are unit-testable
 * in isolation. Display formatting (labels, before→after lines) lives in
 * `src/lib/audit/format.ts`.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/** The logical event's group id from an audit row's `details`, or null. */
export function eventIdFromAuditDetails(details: unknown): string | null {
  return asString(asRecord(details)?.eventId);
}

/** One created event as shown in the My Events list. */
export interface CreatedEventSummary {
  /** The logical event's group id — the per-event history route key. */
  eventId: string;
  /** Rendered title at creation; null when untitled. */
  title: string | null;
  /** Pre-formatted time string (app UTC+8 wall clock). */
  time: string;
  /** Names of the department calendars the event was created in. */
  departments: string[];
  /** Tagged user names (creator included, per app semantics). */
  invitees: string[];
  /** Organizer name, or null. */
  creator: string | null;
  /** Out-of-camp destination, or null. */
  location: string | null;
  /** Event type name, or null for untyped events. */
  type: string | null;
}

/**
 * Parse an `event.create` row's snapshot into a {@link CreatedEventSummary}.
 * Returns null when the payload has no group id (never true for app-created
 * events, but guards malformed/legacy rows).
 */
export function createdEventSummary(details: unknown): CreatedEventSummary | null {
  const record = asRecord(details);
  if (!record) {
    return null;
  }
  const eventId = asString(record.eventId);
  if (!eventId) {
    return null;
  }
  return {
    eventId,
    title: asString(record.title),
    time: asString(record.time) ?? "",
    departments: asStringArray(record.departments),
    invitees: asStringArray(record.invitees),
    creator: asString(record.creator),
    location: asString(record.location),
    type: asString(record.type),
  };
}
