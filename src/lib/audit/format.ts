/**
 * Pure helpers that turn audit rows into display-friendly strings for the
 * Audit Log tab. Kept free of I/O so they can be unit-tested without a DB.
 *
 * Detail rendering has three shapes:
 * - `changes`: a FieldDiff `{ before, after, changes }` — the changed fields
 *   as before→after lines, any other flat top-level keys (e.g. `eventId`,
 *   `email`) as context value lines, and the full `after` record as the
 *   "Resulting state" section.
 * - `fields`: a flat object of scalar values (creates, grants, purges, and
 *   every pre-diff legacy row) — one label/value line per key.
 * - `json`: anything else — pretty-printed JSON fallback.
 */

import { isLocationPolicy, LOCATION_POLICY_LABELS } from "@/lib/events/locationPolicy";
import { isTimeOption, TIME_OPTION_LABELS } from "@/lib/events/timeOptions";
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

/** Field → display label for detail lines; unknown keys render verbatim. */
const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  shortname: "Short name",
  phone: "Phone",
  email: "Email",
  birthday: "Birthday",
  role: "Role",
  status: "Status",
  department: "Department",
  departmentId: "Department",
  title: "Title",
  type: "Type",
  eventType: "Type",
  time: "Time",
  timeOption: "Time option",
  outOfCamp: "Out of camp",
  location: "Location",
  departments: "Departments",
  invitees: "Invitees",
  creator: "Creator",
  targetCalendars: "Calendars",
  targetCalendarIds: "Calendar IDs",
  addedCalendarIds: "Added calendar IDs",
  removedCalendarIds: "Removed calendar IDs",
  eventId: "Event ID",
  googleEventIds: "Google event IDs",
  inviteeUserCount: "Invitee users (count)",
  inviteeDepartmentCount: "Invitee departments (count)",
  googleCalendarId: "Google calendar ID",
  timeOptions: "Time options",
  locationPolicy: "Location policy",
  userKeyword: "Login keyword",
  nameTemplate: "Name template",
  eventTitleTemplate: "Event title template",
  auditLogRetentionDays: "Audit log retention (days)",
  retentionDays: "Retention (days)",
  deleted: "Deleted entries",
  reason: "Reason",
};

/** Display label for a detail field key, falling back to the raw key. */
export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

export interface DetailLine {
  label: string;
  before: string | null;
  after: string | null;
}

export interface DetailValue {
  label: string;
  value: string;
}

export interface AuditDisplayDetails {
  kind: "changes" | "fields" | "json";
  /** Changed-field lines (before → after); only for the `changes` kind. */
  lines: DetailLine[];
  /** Value lines: context extras for `changes`, all fields for `fields`. */
  values: DetailValue[];
  /** The full after-state, rendered as a "Resulting state" section. */
  after: DetailValue[];
  json: string | null;
}

/** Null/undefined marker for empty detail values. */
export const EMPTY_VALUE = "\u2205";

/** Render one detail value for display: nulls, booleans, arrays, and a few
 * domain enums (time option, location policy) get human-readable forms. */
export function valueString(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return EMPTY_VALUE;
  }
  if (key === "timeOption" && isTimeOption(value)) {
    return TIME_OPTION_LABELS[value];
  }
  if (key === "locationPolicy" && isLocationPolicy(value)) {
    return LOCATION_POLICY_LABELS[value];
  }
  if (key === "timeOptions" && Array.isArray(value)) {
    return value.map((entry) => (isTimeOption(entry) ? TIME_OPTION_LABELS[entry] : String(entry))).join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry))).join(", ");
  }
  return JSON.stringify(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a value can render as a single label/value line. */
function isFlatValue(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" || typeof entry === "number");
}

function toValueLines(record: Record<string, unknown>): DetailValue[] {
  return Object.entries(record).map(([key, value]) => ({
    label: fieldLabel(key),
    value: valueString(key, value),
  }));
}

/**
 * Shape the opaque `details` jsonb column for display: a FieldDiff renders as
 * change lines + context values + the resulting state, a flat object as
 * label/value lines, everything else as pretty JSON.
 */
export function formatAuditDetails(details: unknown): AuditDisplayDetails {
  if (isPlainRecord(details)) {
    const changes = details.changes;
    if (isPlainRecord(changes)) {
      const lines = Object.entries(changes).map(([key, pair]) => ({
        label: fieldLabel(key),
        before: Array.isArray(pair) ? valueString(key, pair[0]) : valueString(key, pair),
        after: Array.isArray(pair) ? valueString(key, pair[1]) : null,
      }));
      const values = toValueLines(
        Object.fromEntries(
          Object.entries(details).filter(
            ([key, value]) => key !== "before" && key !== "after" && key !== "changes" && isFlatValue(value),
          ),
        ),
      );
      const after = isPlainRecord(details.after) ? toValueLines(details.after) : [];
      return { kind: "changes", lines, values, after, json: null };
    }
    if (Object.keys(details).length > 0 && Object.values(details).every(isFlatValue)) {
      return { kind: "fields", lines: [], values: toValueLines(details), after: [], json: null };
    }
  }
  return { kind: "json", lines: [], values: [], after: [], json: JSON.stringify(details ?? null, null, 2) };
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
