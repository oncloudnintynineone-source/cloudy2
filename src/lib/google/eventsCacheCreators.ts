import { parseEventPeople } from "@/lib/events/notes";
import { uniqueUuidIds } from "@/lib/uuid";

import type { GcalEventItem } from "./types";

/**
 * Which organizers a cached calendar-month payload contains (docs/neon-usage.md).
 *
 * The organizer lives inside each event's compressed notes block, so it cannot
 * be filtered in SQL. Without an index an organizer-filtered read (My Events)
 * has to ship **every** calendar-month row in the window just to discard the
 * events someone else organized. This helper extracts the distinct creator ids
 * at cache-write time; `google_event_cache_creators` stores them per
 * `(calendar, month)` and the read path uses that set to pre-filter the rows it
 * fetches. Pure and server-free so it is unit-testable.
 *
 * Only valid UUIDs are returned: the notes block is app-written but legacy
 * rows may carry a non-UUID creator (`"admin"`, a stale id), and `creator_id`
 * is a `uuid` column.
 */
export function collectCreatorIds(items: GcalEventItem[]): string[] {
  return uniqueUuidIds(
    items
      .map((item) => parseEventPeople(item.description).creatorId)
      .flatMap((creatorId) => (creatorId ? [creatorId] : [])),
  );
}
