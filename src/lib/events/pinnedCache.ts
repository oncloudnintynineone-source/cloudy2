/**
 * Durable cache for the pinned-events selection (docs/pinned-events.md §1.2).
 *
 * Without it, the header ticker's read scanned **every** department calendar
 * over the rolling 3-month window on each cold serverless instance, then
 * projected every event just to keep the few `pinned` ones (the previous
 * 60s memo was per-instance only). The selection is global (no user filters),
 * changes only on event CRUD, and is small, so it is stored as one singleton
 * row and shared across instances.
 *
 * Freshness semantics match the old memo: served for 60s, then served while a
 * rebuild runs in `after()` (never blocking the read). The drop-invalidates
 * path (`invalidatePinnedSelectionCache`) removes the row on event CRUD, so a
 * mutation is visible on the next read. A rebuild that started before a
 * mutation refuses to persist (the events-cache epoch guard), so a stale scan
 * can never overwrite the post-mutation row.
 *
 * Only the raw `CalendarEvent`s are stored (not rendered titles), so settings,
 * user, and event-type changes apply without invalidating the cache.
 */

import { eq } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { pinnedEventCache } from "@/db/schema";
import { formatInstantToNaive, monthsInRange } from "@/lib/events/datetime";
import { fetchRangeEvents, listCalendars, type CalendarEvent } from "@/lib/events/queries";
import { selectPinnedEvents } from "@/lib/events/pinnedSelect";
import { decodePinnedSelection, pinnedCacheIsFresh } from "@/lib/events/pinnedSelection";
import { readCacheEpoch } from "@/lib/google/eventsCache";

const PINNED_CACHE_ID = "singleton";

/** The rolling "upcoming" window: today through the end of the month two
 * months out (3 calendar months, matching the month-grid reads). */
function pinnedWindowMonths(now: Date = new Date()): string[] {
  const startNaive = formatInstantToNaive(now).slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 3, 0);
  const endNaive = formatInstantToNaive(end).slice(0, 10);
  return monthsInRange(startNaive, endNaive);
}

/** Coalesces concurrent rebuilds within this process (cross-instance duplicates
 *  are harmless: the upsert is idempotent). */
let inflightRebuild: Promise<CalendarEvent[]> | null = null;

async function rebuildUncoalesced(): Promise<CalendarEvent[]> {
  // Snapshot the epoch before the scan. An event mutation bumps it via
  // `invalidateGcalCache`; if that happened while we scanned, the selection may
  // predate the mutation, so return it only to this caller and persist nothing.
  const epochAtStart = await readCacheEpoch();

  const calendars = await listCalendars();
  let selection: CalendarEvent[] = [];
  if (calendars.length > 0) {
    const events = await fetchRangeEvents({
      months: pinnedWindowMonths(),
      calendarIds: calendars.map((calendar) => calendar.id),
      typeFilter: [],
      userFilter: [],
    });
    selection = selectPinnedEvents(events);
  }

  if ((await readCacheEpoch()) === epochAtStart) {
    const fetchedAt = new Date();
    await db
      .insert(pinnedEventCache)
      .values({ id: PINNED_CACHE_ID, events: selection, fetchedAt })
      .onConflictDoUpdate({
        target: pinnedEventCache.id,
        set: { events: selection, fetchedAt },
      });
  }

  return selection;
}

/** Rebuild the selection (scan all calendars × the rolling window) and persist it. */
export function rebuildPinnedSelection(): Promise<CalendarEvent[]> {
  if (inflightRebuild) {
    return inflightRebuild;
  }
  const promise = rebuildUncoalesced().finally(() => {
    if (inflightRebuild === promise) {
      inflightRebuild = null;
    }
  });
  inflightRebuild = promise;
  return promise;
}

/**
 * The stored pinned selection (raw events, before the time-window filter).
 * Serves the row directly while fresh; otherwise schedules a background
 * rebuild and serves the current row. A missing/corrupt row rebuilds blocking.
 */
export async function readPinnedSelection(): Promise<CalendarEvent[]> {
  const [row] = await db
    .select({
      events: pinnedEventCache.events,
      fetchedAt: pinnedEventCache.fetchedAt,
    })
    .from(pinnedEventCache)
    .where(eq(pinnedEventCache.id, PINNED_CACHE_ID))
    .limit(1);

  if (!row) {
    return rebuildPinnedSelection();
  }

  const selection = decodePinnedSelection(row.events);
  if (!selection) {
    return rebuildPinnedSelection();
  }

  if (!pinnedCacheIsFresh(row.fetchedAt, new Date())) {
    after(() => {
      void rebuildPinnedSelection().catch(() => {});
    });
  }

  return selection;
}

/** Drop the stored selection (called on event CRUD / calendar-cache purge). */
export async function invalidatePinnedSelectionCache(): Promise<void> {
  // Let the next read start a fresh rebuild instead of joining one that may
  // have scanned before the mutation. The epoch guard keeps the old rebuild
  // from persisting.
  inflightRebuild = null;
  await db.delete(pinnedEventCache).where(eq(pinnedEventCache.id, PINNED_CACHE_ID));
}
