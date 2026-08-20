/**
 * Pure helpers that turn audit rows into display-friendly strings for the
 * Audit Log tab. Kept free of I/O so they can be unit-tested without a DB.
 */

import type { AuditLog } from "@/db/schema";

const ACTION_LABELS: Record<string, string> = {
  "auth.login.success": "Login succeeded",
  "auth.login.failure": "Login failed",
  "user.create": "User created",
  "user.update": "User updated",
  "user.status.change": "User status changed",
  "calendar.create": "Calendar created",
  "calendar.rename": "Calendar renamed",
  "calendar.delete": "Calendar deleted",
  "eventType.create": "Event type created",
  "eventType.rename": "Event type renamed",
  "eventType.delete": "Event type deleted",
  "event.create": "Event created",
  "event.update": "Event updated",
  "event.delete": "Event deleted",
  "access.grant": "Access granted",
  "access.update": "Access updated",
  "access.revoke": "Access revoked",
  "settings.update": "Settings updated",
  "audit.purge": "Audit log purged",
};

/** Human-readable label for an audit action, falling back to a prettified key. */
export function actionLabel(action: string): string {
  const known = ACTION_LABELS[action];
  if (known) {
    return known;
  }
  return action
    .split(".")
    .map((segment) => (segment ? segment[0].toUpperCase() + segment.slice(1) : segment))
    .join(" ");
}

export interface DetailLine {
  label: string;
  before: string | null;
  after: string | null;
}

export interface AuditDisplayDetails {
  kind: "changes" | "json";
  lines: DetailLine[];
  json: string | null;
}

function valueString(value: unknown): string {
  if (value === null || value === undefined) {
    return "∅";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

/**
 * Shape the opaque `details` jsonb column for display. Update actions store a
 * `{ before, after, changes }` FieldDiff; everything else renders as pretty
 * JSON.
 */
export function formatAuditDetails(details: unknown): AuditDisplayDetails {
  if (typeof details === "object" && details !== null) {
    const record = details as Record<string, unknown>;
    const changes = record.changes;
    if (typeof changes === "object" && changes !== null) {
      const lines = Object.entries(changes as Record<string, [unknown, unknown]>).map(
        ([label, pair]) => ({
          label,
          before: Array.isArray(pair) ? valueString(pair[0]) : valueString(pair),
          after: Array.isArray(pair) ? valueString(pair[1]) : null,
        }),
      );
      return { kind: "changes", lines, json: null };
    }
  }
  return { kind: "json", lines: [], json: JSON.stringify(details ?? null, null, 2) };
}

/** Compact one-line description of the actor, used for the log row header. */
export function actorLabel(row: Pick<AuditLog, "actorName" | "actorRole">): string {
  const role = row.actorRole ? ` (${row.actorRole})` : "";
  return `${row.actorName ?? "Unknown"}${role}`;
}

/** `YYYY-MM-DD HH:MM` in the app's Asia/Singapore wall clock (UTC+8, no DST). */
export function formatLogTimestamp(createdAt: Date): string {
  const singapore = new Date(createdAt.getTime() + 8 * 3_600_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${singapore.getUTCFullYear()}-${pad(singapore.getUTCMonth() + 1)}-${pad(
    singapore.getUTCDate(),
  )} ${pad(singapore.getUTCHours())}:${pad(singapore.getUTCMinutes())}`;
}
