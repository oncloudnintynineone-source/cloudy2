/**
 * Pure helpers that build the human-readable snapshot of an event stored in
 * the `details` column of `audit_logs` rows (event create/update/delete).
 * Snapshots carry display names (departments, invitees, creator) instead of
 * ids, and a single pre-formatted `time` string, so an admin reading the audit
 * log never has to interpret raw ids or enums. Kept free of I/O so the helpers
 * are unit-testable without a database or Google credentials.
 */

import type { GcalEventItem } from "@/lib/google";
import {
  parseEventEndAmPm,
  parseEventOutOfCamp,
  parseEventStartAmPm,
  parseEventTimeOption,
  parseEventTitle,
  parseEventType,
} from "./notes";
import type { AmPm, TimeOption } from "./timeOptions";
import type { EventRef } from "./targets";

/** Human-readable snapshot of one event, for audit log details. */
export type EventAuditSnapshot = {
  /** The rendered Google Calendar title (what users see); null when untitled. */
  title: string | null;
  /** The raw description typed in the event form; null when unknown/blank. */
  description: string | null;
  /** Event type name; null for untyped events. */
  type: string | null;
  /** Pre-formatted start–end string in the app's UTC+8 wall clock. */
  time: string;
  outOfCamp: boolean;
  /** Out-of-camp destination; null for in-camp events. */
  location: string | null;
  /** Names of the department calendars the event lives in. */
  departments: string[];
  /** Names of the tagged users (creator included, per app semantics). */
  invitees: string[];
  /** Name of the user the event belongs to, or null. */
  creator: string | null;
};

/** Naive `YYYY-MM-DD HH:mm:ss` parts a snapshot's `time` is rendered from. */
export interface EventTimeParts {
  timeOption: TimeOption;
  /** Naive `YYYY-MM-DD HH:mm:ss`. */
  start: string;
  /** Naive `YYYY-MM-DD HH:mm:ss` (inclusive last day for full-day events). */
  end: string;
  startAmPm: AmPm;
  endAmPm: AmPm;
}

/** Id → display name lookups the snapshot builders resolve through. */
export interface EventSnapshotNames {
  /** Department (calendar) id → name. */
  departmentNames: Record<string, string>;
  /** User id → name. */
  userNames: Record<string, string>;
}

const EN_DASH = "\u2013";

/** `YYYY-MM-DD` part of a naive datetime string. */
function datePart(naive: string): string {
  return naive.slice(0, 10);
}

/** `HH:mm[:ss]` part of a naive datetime string; zero seconds are dropped. */
function clockPart(naive: string): string {
  const clock = naive.slice(11);
  return clock.endsWith(":00") ? clock.slice(0, 5) : clock;
}

/**
 * Render the event's datetime as one human-readable string in the app's
 * UTC+8 wall clock:
 * - `range`: `2026-08-21 14:00 – 15:30` (same day) or
 *   `2026-08-21 14:00 – 2026-08-23 09:30` (multi-day).
 * - `full`: dates with optional (AM)/(PM) markers — `2026-08-21 (AM)`,
 *   `2026-08-21 (AM–PM)`, `2026-08-21 – 2026-08-23 (PM)`.
 */
export function formatEventAuditTime(parts: EventTimeParts): string {
  const startDay = datePart(parts.start);
  const endDay = datePart(parts.end);

  if (parts.timeOption !== "full") {
    if (startDay === endDay) {
      return `${startDay} ${clockPart(parts.start)} ${EN_DASH} ${clockPart(parts.end)}`;
    }
    return `${startDay} ${clockPart(parts.start)} ${EN_DASH} ${endDay} ${clockPart(parts.end)}`;
  }

  const startMarker = parts.startAmPm ? ` (${parts.startAmPm})` : "";
  const endMarker = parts.endAmPm ? ` (${parts.endAmPm})` : "";
  if (startDay === endDay) {
    if (parts.startAmPm && parts.endAmPm && parts.startAmPm !== parts.endAmPm) {
      return `${startDay} (${parts.startAmPm}${EN_DASH}${parts.endAmPm})`;
    }
    return `${startDay}${startMarker}`;
  }
  return `${startDay}${startMarker} ${EN_DASH} ${endDay}${endMarker}`;
}

/**
 * Build the after-state snapshot from form values plus the resolved id → name
 * maps. Unknown ids are dropped from the name lists; blank title/description/
 * location become null.
 */
export function buildEventSnapshot(input: {
  /** The rendered Google Calendar title (callers compute it via `renderEventTitle`). */
  title: string;
  /** The raw description typed in the event form. */
  description: string;
  type: string;
  timeParts: EventTimeParts;
  outOfCamp: boolean;
  location: string;
  departmentIds: string[];
  inviteeUserIds: string[];
  creatorId: string | null;
  names: EventSnapshotNames;
}): EventAuditSnapshot {
  return {
    title: input.title.trim() || null,
    description: input.description.trim() || null,
    type: input.type.trim() || null,
    time: formatEventAuditTime(input.timeParts),
    outOfCamp: input.outOfCamp,
    location: input.location.trim() || null,
    departments: input.departmentIds
      .map((id) => input.names.departmentNames[id])
      .filter((name): name is string => Boolean(name)),
    invitees: [...new Set(input.inviteeUserIds)]
      .map((id) => input.names.userNames[id])
      .filter((name): name is string => Boolean(name)),
    creator: input.creatorId ? (input.names.userNames[input.creatorId] ?? null) : null,
  };
}

/**
 * Build the before-state snapshot for an existing event from its edit/delete
 * reference plus one representative copy read back from Google (or null when
 * none was found). Times and people come from the ref; the title is the copy's
 * Google summary (visible even for legacy/external/blank-description events),
 * while the description, type, datetime option, AM/PM markers, out-of-camp
 * flag, and location come from the copy's notes — null/false when the copy is
 * missing or is a legacy event without a notes block.
 */
export function snapshotFromCopy(
  ref: EventRef,
  copy: GcalEventItem | null,
  names: EventSnapshotNames,
  departmentIds: string[],
): EventAuditSnapshot {
  const description = copy?.description ?? "";
  return buildEventSnapshot({
    title: copy?.title ?? "",
    description: parseEventTitle(description) ?? "",
    type: parseEventType(description) ?? "",
    timeParts: {
      timeOption: parseEventTimeOption(description) ?? (ref.allDay ? "full" : "range"),
      start: ref.start,
      end: ref.end,
      startAmPm: parseEventStartAmPm(description) ?? "",
      endAmPm: parseEventEndAmPm(description) ?? "",
    },
    outOfCamp: parseEventOutOfCamp(description),
    location: copy?.location ?? "",
    departmentIds,
    inviteeUserIds: ref.inviteeUserIds,
    creatorId: ref.creatorId,
    names,
  });
}
