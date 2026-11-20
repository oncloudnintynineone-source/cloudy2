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

import { isLocationCategory, LOCATION_CATEGORY_LABELS } from "@/lib/events/locationPolicy";
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
  "calendar.update": "Calendar updated",
  "calendar.delete": "Calendar deleted",
  "eventType.create": "Event type created",
  "eventType.rename": "Event type renamed",
  "eventType.delete": "Event type deleted",
  "eventType.migrate": "Event type references migrated",
  "quickLink.create": "Quick link created",
  "quickLink.update": "Quick link updated",
  "quickLink.delete": "Quick link deleted",
  "kahGroup.create": "KAH group created",
  "kahGroup.update": "KAH group updated",
  "kahGroup.delete": "KAH group deleted",
  "kah.breachNotify": "KAH limit breach notified",
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
  label: "Label",
  url: "URL",
  icon: "Icon",
  order: "Order",
  color: "Color",
  shortname: "Short name",
  phone: "Phone",
  email: "Email",
  birthday: "Birthday",
  role: "Role",
  status: "Status",
  department: "Department",
  departmentId: "Department",
  title: "Title",
  description: "Description",
  type: "Type",
  eventType: "Type",
  from: "From",
  to: "To",
  rangeFrom: "Range start",
  rangeTo: "Range end",
  updateTitles: "Update titles",
  eventsScanned: "Events scanned",
  eventsUpdated: "Events updated",
  failed: "Failed",
  cancelled: "Cancelled",
  time: "Time",
  timeOption: "Time option",
  outOfCamp: "Out of camp",
  overseas: "Overseas",
  location: "Location",
  departments: "Departments",
  invitees: "Participants",
  creator: "Creator",
  targetCalendars: "Calendars",
  targetCalendarIds: "Calendar IDs",
  addedCalendarIds: "Added calendar IDs",
  removedCalendarIds: "Removed calendar IDs",
  eventId: "Event ID",
  googleEventIds: "Google event IDs",
  inviteeUserCount: "Participants (users, count)",
  inviteeDepartmentCount: "Participants (departments, count)",
  googleCalendarId: "Google calendar ID",
  timeOptions: "Time options",
  locationPolicy: "Location policy",
  allowedLocations: "Allowed locations",
  showLocation: "Show location",
  showRemarks: "Show remarks",
  registration: "Registration",
  excludeFromClash: "Exclude from conflict checks",
  userKeyword: "Login keyword",
  nameTemplate: "Name template",
  eventTitleRecipe: "Event title template",
  recipe: "Recipe",
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
export const EMPTY_VALUE = "\u2014";

/** Render one detail value for display: nulls, booleans, arrays, and a few
 * domain enums (time option, location policy) get human-readable forms. */
export function valueString(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return EMPTY_VALUE;
  }
  if (key === "timeOption" && isTimeOption(value)) {
    return TIME_OPTION_LABELS[value];
  }
  if (key === "allowedLocations" && Array.isArray(value)) {
    return value
      .map((entry) => (isLocationCategory(entry) ? LOCATION_CATEGORY_LABELS[entry] : String(entry)))
      .join(", ");
  }
  if (key === "timeOptions" && Array.isArray(value)) {
    return value
      .map((entry) => (isTimeOption(entry) ? TIME_OPTION_LABELS[entry] : String(entry)))
      .join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)))
      .join(", ");
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
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" || typeof entry === "number")
  );
}

function valueLines(record: Record<string, unknown>, dropEmpty?: boolean): DetailValue[] {
  return Object.entries(record)
    .map(([key, value]) => ({
      label: fieldLabel(key),
      value: valueString(key, value),
    }))
    .filter((line) => !dropEmpty || !isEmptyValue(line.value));
}

/**
 * Options for `formatAuditDetails` / `changeSummary`. The admin audit log calls
 * them with no options and stays forensic — every key the row carries. The
 * event history passes a curated view (see `EVENT_HISTORY_OMIT_KEYS`), because
 * there the reader is the person who made the change, not the operator
 * investigating one.
 */
export interface AuditDetailOptions {
  /** Keys to drop from the change lines, the context values, and the
   *  resulting-state dump. */
  omitKeys?: readonly string[];
  /** Drop label/value lines whose value carries nothing (empty string, empty
   *  list, `—`). Applies to the context and resulting-state lines only — a
   *  change from nothing to something is a real change and is never dropped. */
  dropEmpty?: boolean;
  /** Render the full `after` record as "Resulting state" (default true). */
  includeAfter?: boolean;
}

/**
 * What the event history hides from an event audit row: the identifiers an
 * operator would chase but the reader cannot act on, and the **rendered** Google
 * Calendar title — a derived value (template + type + department) that changes
 * as a consequence of an edit rather than being one. The event's own title is
 * already the history modal's heading.
 */
export const EVENT_HISTORY_OMIT_KEYS = [
  "title",
  "eventId",
  "googleEventIds",
  "googleCalendarId",
  "targetCalendarIds",
  "addedCalendarIds",
  "removedCalendarIds",
] as const;

/** Whether a rendered value says nothing worth a line of its own. */
function isEmptyValue(value: string): boolean {
  return value === EMPTY_VALUE || value.trim() === "";
}

/**
 * Shape the opaque `details` jsonb column for display: a FieldDiff renders as
 * change lines + context values + the resulting state, a flat object as
 * label/value lines, everything else as pretty JSON.
 */
export function formatAuditDetails(
  details: unknown,
  options: AuditDetailOptions = {},
): AuditDisplayDetails {
  const { omitKeys, dropEmpty, includeAfter = true } = options;
  const keep = (key: string) => !omitKeys?.includes(key);
  if (isPlainRecord(details)) {
    const changes = details.changes;
    if (isPlainRecord(changes)) {
      const lines = Object.entries(changes)
        .filter(([key]) => keep(key))
        .map(([key, pair]) => ({
          label: fieldLabel(key),
          before: Array.isArray(pair) ? valueString(key, pair[0]) : valueString(key, pair),
          after: Array.isArray(pair) ? valueString(key, pair[1]) : null,
        }));
      const values = valueLines(
        Object.fromEntries(
          Object.entries(details).filter(
            ([key, value]) =>
              key !== "before" &&
              key !== "after" &&
              key !== "changes" &&
              keep(key) &&
              isFlatValue(value),
          ),
        ),
        dropEmpty,
      );
      const after =
        isPlainRecord(details.after) && includeAfter
          ? valueLines(
              Object.fromEntries(Object.entries(details.after).filter(([key]) => keep(key))),
              dropEmpty,
            )
          : [];
      return { kind: "changes", lines, values, after, json: null };
    }
    const entries = Object.entries(details).filter(([key]) => keep(key));
    if (entries.length > 0 && entries.every(([, value]) => isFlatValue(value))) {
      const values = valueLines(Object.fromEntries(entries), dropEmpty);
      return { kind: "fields", lines: [], values, after: [], json: null };
    }
  }
  return {
    kind: "json",
    lines: [],
    values: [],
    after: [],
    json: JSON.stringify(details ?? null, null, 2),
  };
}

/**
 * Whether a formatted payload has anything left to show once the caller's
 * options are applied. The event history uses it to hide the expand control on
 * an entry whose only change was one the reader cannot act on.
 */
export function hasAuditDetails(details: AuditDisplayDetails): boolean {
  return (
    details.kind === "json" ||
    details.lines.length > 0 ||
    details.values.length > 0 ||
    details.after.length > 0
  );
}

/**
 * A concise one-line summary for a collapsed audit entry: the changed field
 * labels for an edit (from the shared `FieldDiff` shaping), or `entityName`
 * for a create/delete snapshot. Null when there is nothing useful to show.
 */
export function changeSummary(
  details: unknown,
  entityName: string | null,
  options?: AuditDetailOptions,
): string | null {
  const formatted = formatAuditDetails(details, options);
  if (formatted.kind === "changes") {
    return formatted.lines.length > 0 ? formatted.lines.map((line) => line.label).join(", ") : null;
  }
  return entityName;
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
