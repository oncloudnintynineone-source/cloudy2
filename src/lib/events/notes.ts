/**
 * Pure encoding/parsing of the machine-readable "notes" block stored on Google
 * Calendar events (in the event `description`). The block is a JSON object so
 * additional fields can be added later without a format migration.
 */

import { isTimeOption, type TimeOption } from "./timeOptions";

export interface EventNotes {
  eventType?: string;
  /**
   * The raw description typed into the event form, kept so editing can
   * prefill the form with the original text instead of the templated title
   * rendered into the Google event summary.
   */
  title?: string;
  /** Logical event group id; all linked copies (one per department calendar) share it. */
  eventId?: string;
  /** Id of the user who created the event (schedule view: its row always shows the event). */
  createdBy?: string;
  /** Ids of users tagged on the event (schedule view: the event shows in each of their rows). */
  inviteeUsers?: string[];
  /** Department (calendar) ids tagged on the event (schedule view: shows in each department row). */
  inviteeDepartments?: string[];
  /** Datetime option used to create the event ("range" | "full"). */
  timeOption?: string;
  /** Start half-of-day indicator for "full" events. */
  startAmPm?: string;
  /** End half-of-day indicator for "full" events. */
  endAmPm?: string;
  [key: string]: unknown;
}

/** Serialize notes to the JSON string stored on the event, or "" when empty. */
export function encodeEventNotes(notes: EventNotes): string {
  const cleaned = Object.fromEntries(
    Object.entries(notes).filter(
      ([, value]) =>
        value !== undefined &&
        value !== null &&
        value !== "" &&
        !(Array.isArray(value) && value.length === 0),
    ),
  );
  return Object.keys(cleaned).length === 0 ? "" : JSON.stringify(cleaned);
}

/** People linked to an event: the creator plus tagged users and departments. */
export interface EventPeople {
  /** Linked event group id (all department copies share it), or null for legacy events. */
  eventId: string | null;
  creatorId: string | null;
  userIds: string[];
  departmentIds: string[];
}

/** Unique, non-empty strings from an untrusted JSON value. */
function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && entry && !seen.has(entry)) {
      seen.add(entry);
      out.push(entry);
    }
  }
  return out;
}

/** Extract the linked people from the notes block, tolerating absent/malformed values. */
export function parseEventPeople(description: string): EventPeople {
  const notes = parseEventNotes(description);
  const creatorId = notes?.createdBy;
  const eventId = notes?.eventId;
  return {
    eventId: typeof eventId === "string" && eventId ? eventId : null,
    creatorId: typeof creatorId === "string" && creatorId ? creatorId : null,
    userIds: uniqueStrings(notes?.inviteeUsers),
    departmentIds: uniqueStrings(notes?.inviteeDepartments),
  };
}

/** Parse the JSON notes block from an event description, or null when absent/malformed. */
export function parseEventNotes(description: string): EventNotes | null {
  if (!description) {
    return null;
  }
  try {
    const parsed = JSON.parse(description);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as EventNotes)
      : null;
  } catch {
    return null;
  }
}

/** Extract the event type name from the notes block, or null. */
export function parseEventType(description: string): string | null {
  const notes = parseEventNotes(description);
  const eventType = notes?.eventType;
  return typeof eventType === "string" && eventType ? eventType : null;
}

/** Extract the raw (pre-template) description from the notes block, or null (legacy). */
export function parseEventTitle(description: string): string | null {
  const notes = parseEventNotes(description);
  const title = notes?.title;
  return typeof title === "string" && title ? title : null;
}

/** Extract the datetime option from the notes block, or null (legacy). */
export function parseEventTimeOption(description: string): TimeOption | null {
  const notes = parseEventNotes(description);
  const timeOption = notes?.timeOption;
  return isTimeOption(timeOption) ? timeOption : null;
}

/** Extract the start half-of-day indicator from the notes block, or null. */
export function parseEventStartAmPm(description: string): "AM" | "PM" | null {
  const notes = parseEventNotes(description);
  const startAmPm = notes?.startAmPm;
  return startAmPm === "AM" || startAmPm === "PM" ? startAmPm : null;
}

/** Extract the end half-of-day indicator from the notes block, or null. */
export function parseEventEndAmPm(description: string): "AM" | "PM" | null {
  const notes = parseEventNotes(description);
  const endAmPm = notes?.endAmPm;
  return endAmPm === "AM" || endAmPm === "PM" ? endAmPm : null;
}
