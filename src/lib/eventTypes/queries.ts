import { asc, inArray } from "drizzle-orm";

import { db } from "@/db";
import { eventTypes } from "@/db/schema";

/** All event types, ordered by name. */
export async function listEventTypes() {
  return db.select().from(eventTypes).orderBy(asc(eventTypes.name));
}

export interface EventTypeDisplayInfo {
  name: string;
  shortname: string | null;
}

/**
 * Lookup of event types by name (name → shortname) for rendering event title
 * templates. Names that don't match are omitted from the result.
 */
export async function getEventTypesByNames(names: string[]): Promise<Map<string, EventTypeDisplayInfo>> {
  const uniqueNames = [...new Set(names.filter((name) => name.trim()))];
  if (uniqueNames.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ name: eventTypes.name, shortname: eventTypes.shortname })
    .from(eventTypes)
    .where(inArray(eventTypes.name, uniqueNames));
  return new Map(rows.map((row) => [row.name, { name: row.name, shortname: row.shortname }]));
}
