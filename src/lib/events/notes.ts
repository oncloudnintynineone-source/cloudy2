/**
 * Pure encoding/parsing of the machine-readable "notes" block stored on Google
 * Calendar events (in the event `description`). The block is a JSON object so
 * additional fields can be added later without a format migration; v3 stores
 * it brotli-compressed and base64url-encoded on a single line (short, and
 * opaque to calendar viewers), with a human-readable `Edit: <url>` line above
 * it so the edit link is visible — and linkified — in Google Calendar's notes.
 * A human-readable marker line at the very bottom identifies the event as
 * created in the app (see `INTERNAL_EVENT_MARKER`); events without it (and
 * without a notes block) are treated as externally created.
 * v1 (raw JSON) and v2 (JSON line under the `Edit:` line) descriptions still
 * parse.
 */

import { brotliCompressSync, brotliDecompressSync, gunzipSync } from "node:zlib";

import { isTimeOption, type TimeOption } from "./timeOptions";

export interface EventNotes {
  eventType?: string;
  /**
   * The raw description typed into the event form, kept so editing can
   * prefill the form with the original text instead of the templated title
   * rendered into the Google event summary. An empty string is preserved
   * (unlike other blank values) to record a deliberately empty description.
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
    Object.entries(notes).filter(([key, value]) => {
      if (value === undefined || value === null) {
        return false;
      }
      if (Array.isArray(value) && value.length === 0) {
        return false;
      }
      // A blank title must round-trip so the edit form can tell "no
      // description was typed" apart from a legacy event without notes.
      if (value === "") {
        return key === "title";
      }
      return true;
    }),
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

function tryParseObject(text: string): EventNotes | null {
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as EventNotes)
      : null;
  } catch {
    return null;
  }
}

/**
 * Encode the notes JSON into the single block line stored below the `Edit:`
 * link: brotli-compressed, then base64url-encoded without padding. Keeps the
 * notes short and opaque to calendar viewers; deterministic (fixed
 * compressor settings), so a given JSON always yields the same line.
 */
export function encodeNotesBlock(json: string): string {
  return brotliCompressSync(Buffer.from(json, "utf8")).toString("base64url");
}

/**
 * Decode a base64url block line into notes: base64url-decode, then inflate
 * (brotli first — the current writer — gzip as a codec fallback), then JSON.
 * Node's base64url decoder accepts the standard base64 alphabet and padding
 * too, so either spelling round-trips.
 */
function inflateNotesBlock(line: string): EventNotes | null {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(line, "base64url");
  } catch {
    return null;
  }
  for (const inflate of [brotliDecompressSync, gunzipSync]) {
    try {
      return tryParseObject(inflate(bytes).toString("utf8"));
    } catch {
      // Not this codec — try the next.
    }
  }
  return null;
}

/**
 * Parse the notes block from an event description, or null when
 * absent/malformed. Handles all three stored formats: v3 (an `Edit: <url>`
 * line above a single base64url brotli block), v2 (a raw JSON line under the
 * `Edit:` line), and v1 (the description is the JSON block alone). When the
 * whole string is not valid JSON, lines are scanned bottom-up for a JSON line
 * or an inflatable block line.
 */
export function parseEventNotes(description: string): EventNotes | null {
  if (!description) {
    return null;
  }
  const direct = tryParseObject(description);
  if (direct !== null) {
    return direct;
  }
  const lines = description.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }
    const raw = line.startsWith("{") ? tryParseObject(line) : null;
    if (raw !== null) {
      return raw;
    }
    const inflated = inflateNotesBlock(line);
    if (inflated !== null) {
      return inflated;
    }
  }
  return null;
}

/**
 * Assemble the full event description from an encoded notes block: the
 * human-readable `Edit: <url>` line on top (Google Calendar linkifies plain
 * URLs in the notes) with the block below. An empty block still yields the
 * link line; an empty url leaves the block untouched.
 */
export function withEditLink(block: string, url: string): string {
  if (!url) {
    return block;
  }
  const line = `Edit: ${url}`;
  return block ? `${line}\n\n${block}` : line;
}

/**
 * Human-readable marker line the app writes at the bottom of every event
 * description it creates or edits. Its presence is the signal that an event
 * was created in the app (as opposed to directly in Google Calendar).
 */
export const INTERNAL_EVENT_MARKER = "Created in cloudy2";

/** True when the description carries the app's internal-creation marker line. */
export function hasInternalEventMarker(description: string): boolean {
  return description.includes(INTERNAL_EVENT_MARKER);
}

/**
 * Append the internal-creation marker at the bottom of a description. Callers
 * must supply the description built so far (`Edit:` line + notes block); the
 * marker is added one blank line below and never duplicated.
 */
export function withInternalMarker(description: string): string {
  if (hasInternalEventMarker(description)) {
    return description;
  }
  return description ? `${description}\n\n${INTERNAL_EVENT_MARKER}` : INTERNAL_EVENT_MARKER;
}

/**
 * Whether an event was created outside the app. Events count as internal when
 * they carry the marker line OR a parseable notes block (older in-app events
 * predate the marker but still hold the block the app wrote); everything else
 * — e.g. events created directly in Google Calendar — is external.
 */
export function isExternalEvent(description: string): boolean {
  return !hasInternalEventMarker(description) && parseEventNotes(description) === null;
}

/**
 * Build the dashboard URL that deep-links an event's edit form: the start
 * (naive `YYYY-MM-DD …`) pins the month the link arrives in, and the event
 * group id picks the event out of it.
 */
export function eventEditUrl(baseUrl: string, start: string, eventId: string): string {
  const params = new URLSearchParams();
  const date = start.slice(0, 10);
  if (date) {
    params.set("date", date);
  }
  params.set("edit", eventId);
  return `${baseUrl}/dashboard?${params.toString()}`;
}

/** Extract the event type name from the notes block, or null. */
export function parseEventType(description: string): string | null {
  const notes = parseEventNotes(description);
  const eventType = notes?.eventType;
  return typeof eventType === "string" && eventType ? eventType : null;
}

/**
 * Extract the raw (pre-template) description from the notes block: an empty
 * string when the description was deliberately left blank, null for legacy
 * events that predate the field.
 */
export function parseEventTitle(description: string): string | null {
  const notes = parseEventNotes(description);
  const title = notes?.title;
  return typeof title === "string" ? title : null;
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
