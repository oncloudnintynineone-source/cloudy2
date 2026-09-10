import { asc, inArray } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { eventTypes, eventTypeGroups } from "@/db/schema";
import {
  normalizeAllowedLocations,
  type LocationCategory,
} from "@/lib/events/locationPolicy";
import {
  normalizeTimeOptions,
  resolveTimeOptions,
  type TimeOption,
} from "@/lib/events/timeOptions";

/**
 * All event types, ordered by name, with normalized time options, allowed
 * locations, and field-visibility flags. Wrapped in React's per-request
 * `cache()` so callers that share a render (the dashboard page +
 * `fetchRangeEvents`) hit the DB once; request-scoped only, so admin edits
 * still appear on the next request.
 */
export const listEventTypes = cache(async () => {
  const rows = await db.select().from(eventTypes).orderBy(asc(eventTypes.name));
  return rows.map((row) => ({
    ...row,
    timeOptions: resolveTimeOptions(normalizeTimeOptions(row.timeOptions)),
    allowedLocations: normalizeAllowedLocations(row.allowedLocations),
  }));
});

/**
 * All event type groups in display order (sortOrder, then name), for the
 * event form's grouped type picker and the admin group list. Same
 * per-request `cache()` as `listEventTypes`.
 */
export const listEventTypeGroups = cache(async () => {
  return db
    .select({
      id: eventTypeGroups.id,
      name: eventTypeGroups.name,
      sortOrder: eventTypeGroups.sortOrder,
    })
    .from(eventTypeGroups)
    .orderBy(asc(eventTypeGroups.sortOrder), asc(eventTypeGroups.name));
});

export interface EventTypeDisplayInfo {
  name: string;
  shortname: string | null;
  /** Selectable datetime options (resolved; never empty). */
  timeOptions: TimeOption[];
  /** Location categories events of this type may take place in (never empty). */
  allowedLocations: LocationCategory[];
  /** Whether the event form shows the Remarks (description) step. */
  showRemarks: boolean;
  /** Whether the event form shows the Participants step. */
  showInvitees: boolean;
  /**
   * Whether the wizard shows the Location step; false means the type skips it
   * and events save in its sole allowed location category with no specific
   * location (valid only when the allowlist has one entry).
   */
  showLocation: boolean;
  /**
   * Whether events of this type are informational and excluded from clash
   * (double-booking) checks.
   */
  excludeFromClash: boolean;
}

/**
 * Lookup of event types by name (name → shortname, time options, allowed
 * locations, remarks/invitees/location flags) for rendering event title
 * templates and enforcing the form's datetime selector and location category
 * rules. Names that don't match are omitted.
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
      showLocation: eventTypes.showLocation,
      excludeFromClash: eventTypes.excludeFromClash,
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
        showLocation: row.showLocation,
        excludeFromClash: row.excludeFromClash,
      },
    ]),
  );
}
