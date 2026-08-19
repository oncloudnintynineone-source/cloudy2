import { asc, inArray } from "drizzle-orm";

import { db } from "@/db";
import { eventTypes } from "@/db/schema";
import { normalizeLocationPolicy, type LocationPolicy } from "@/lib/events/locationPolicy";
import {
  normalizeTimeOptions,
  resolveTimeOptions,
  type TimeOption,
} from "@/lib/events/timeOptions";

/** All event types, ordered by name, with normalized time options and location policy. */
export async function listEventTypes() {
  const rows = await db.select().from(eventTypes).orderBy(asc(eventTypes.name));
  return rows.map((row) => ({
    ...row,
    timeOptions: resolveTimeOptions(normalizeTimeOptions(row.timeOptions)),
    locationPolicy: normalizeLocationPolicy(row.locationPolicy),
  }));
}

export interface EventTypeDisplayInfo {
  name: string;
  shortname: string | null;
  /** Selectable datetime options (resolved; never empty). */
  timeOptions: TimeOption[];
  /** Where events of this type may take place ("in" | "out" | "both"). */
  locationPolicy: LocationPolicy;
}

/**
 * Lookup of event types by name (name → shortname, time options, location policy)
 * for rendering event title templates and enforcing the form's datetime selector
 * and Out of Camp / location rules. Names that don't match are omitted.
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
      locationPolicy: eventTypes.locationPolicy,
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
        locationPolicy: normalizeLocationPolicy(row.locationPolicy),
      },
    ]),
  );
}
