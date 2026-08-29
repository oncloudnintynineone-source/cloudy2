import { asc, inArray } from "drizzle-orm";

import { db } from "@/db";
import { eventTypes } from "@/db/schema";
import {
  normalizeAllowedLocations,
  type LocationCategory,
} from "@/lib/events/locationPolicy";
import {
  normalizeTimeOptions,
  resolveTimeOptions,
  type TimeOption,
} from "@/lib/events/timeOptions";

/** All event types, ordered by name, with normalized time options, allowed locations, and field-visibility flags. */
export async function listEventTypes() {
  const rows = await db.select().from(eventTypes).orderBy(asc(eventTypes.name));
  return rows.map((row) => ({
    ...row,
    timeOptions: resolveTimeOptions(normalizeTimeOptions(row.timeOptions)),
    allowedLocations: normalizeAllowedLocations(row.allowedLocations),
  }));
}

export interface EventTypeDisplayInfo {
  name: string;
  shortname: string | null;
  /** Selectable datetime options (resolved; never empty). */
  timeOptions: TimeOption[];
  /** Location categories events of this type may take place in (never empty). */
  allowedLocations: LocationCategory[];
  /** Whether the event form shows the Remarks (description) step. */
  showRemarks: boolean;
  /** Whether the event form shows the Invited Attendees step. */
  showInvitees: boolean;
}

/**
 * Lookup of event types by name (name → shortname, time options, allowed
 * locations, remarks/invitees flags) for rendering event title templates and
 * enforcing the form's datetime selector and location category rules. Names
 * that don't match are omitted.
 */
export async function getEventTypesByNames(
  names: string[],
): Promise<Map<string, EventTypeDisplayInfo>> {
  const uniqueNames = [...new Set(names.filter((name) => name.trim()))];
  if (uniqueNames.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      name: eventTypes.name,
      shortname: eventTypes.shortname,
      timeOptions: eventTypes.timeOptions,
      allowedLocations: eventTypes.allowedLocations,
      showRemarks: eventTypes.showRemarks,
      showInvitees: eventTypes.showInvitees,
    })
    .from(eventTypes)
    .where(inArray(eventTypes.name, uniqueNames));
  return new Map(
    rows.map((row) => [
      row.name,
      {
        name: row.name,
        shortname: row.shortname,
        timeOptions: resolveTimeOptions(normalizeTimeOptions(row.timeOptions)),
        allowedLocations: normalizeAllowedLocations(row.allowedLocations),
        showRemarks: row.showRemarks,
        showInvitees: row.showInvitees,
      },
    ]),
  );
}
