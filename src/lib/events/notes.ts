/**
 * Pure encoding/parsing of the machine-readable "notes" block stored on Google
 * Calendar events (in the event `description`). The block is a JSON object so
 * additional fields can be added later without a format migration.
 */

export interface EventNotes {
  eventType?: string;
  [key: string]: unknown;
}

/** Serialize notes to the JSON string stored on the event, or "" when empty. */
export function encodeEventNotes(notes: EventNotes): string {
  const cleaned = Object.fromEntries(
    Object.entries(notes).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );
  return Object.keys(cleaned).length === 0 ? "" : JSON.stringify(cleaned);
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
