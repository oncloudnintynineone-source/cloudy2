import { asc } from "drizzle-orm";

import { db } from "@/db";
import { eventTypes } from "@/db/schema";

/** All event types, ordered by name. */
export async function listEventTypes() {
  return db.select().from(eventTypes).orderBy(asc(eventTypes.name));
}
