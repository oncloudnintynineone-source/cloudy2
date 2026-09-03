import { and, eq, inArray } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { googleEventCache } from "@/db/schema";
import { mapWithConcurrency } from "@/lib/async";
import { monthRange } from "@/lib/events/datetime";
import { getGoogleIntegration } from "./index";
import { cacheEntryState, decodeCachedEvents, encodeCachedEvents } from "./eventsCacheCodec";
import type { GcalEventItem } from "./types";

/** Serve cached month data directly for this long. */
export const GCAL_CACHE_FRESH_MS = 60_000;

/** Hard expire: stale entries are refreshed in the background until this age. */
export const GCAL_CACHE_EXPIRE_MS = 30 * 60_000;

/** Max Google `events.list` calls in flight for a cold refresh (bounded for quota). */
const GOOGLE_FETCH_CONCURRENCY = 4;

/** Simple cap so an idle instance can't grow the L1 map without bound. */
const MAX_MEMORY_ENTRIES = 512;

/**
 * A shared L2 row is treated as "newer than the local L1 copy" only when it
 * beats it by at least this much — otherwise a local refresh's own upsert
 * (microseconds apart) would re-download the same month payload for nothing.
 */
const ROW_NEWER_TOLERANCE_MS = 1_000;

interface MemoryEntry {
  events: GcalEventItem[];
  fetchedAt: number;
}

/**
 * L1 in-process cache in front of the `google_event_cache` table (L2). Postgres
 * is the shared, durable source of truth across serverless instances; this map
 * makes repeat views within one warm instance skip the DB round-trip entirely.
 * Keyed by `(googleCalendarId, month)`.
 */
const memory = new Map<string, MemoryEntry>();

/** Coalesces concurrent refreshes of the same key within this process. */
const inflight = new Map<string, Promise<GcalEventItem[]>>();

function memoryKey(googleCalendarId: string, month: string): string {
  return `${googleCalendarId}:${month}`;
}

function remember(
  googleCalendarId: string,
  month: string,
  items: GcalEventItem[],
  fetchedAt: number = Date.now(),
): void {
  memory.set(memoryKey(googleCalendarId, month), { events: items, fetchedAt });
  if (memory.size > MAX_MEMORY_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) {
      memory.delete(oldest);
    }
  }
}

/**
 * Fetch a calendar's month from Google and upsert the cache entry (DB + L1).
 * Concurrent callers for the same key share one in-flight promise.
 */
function refreshCachedMonth(
  googleCalendarId: string,
  month: string,
): Promise<GcalEventItem[]> {
  const key = memoryKey(googleCalendarId, month);
  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }
  const promise = refreshMonthEvents(googleCalendarId, month).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

/** Whether a memory entry is still usable (fresh or stale, not expired). */
function entryState(entry: MemoryEntry): "fresh" | "stale" | "expired" {
  return cacheEntryState(
    new Date(entry.fetchedAt),
    new Date(),
    GCAL_CACHE_FRESH_MS,
    GCAL_CACHE_EXPIRE_MS,
  );
}

/** Whether a DB row is still usable and whether it needs a background refresh. */
function rowUsable(fetchedAt: Date): { usable: boolean; stale: boolean } {
  const state = cacheEntryState(fetchedAt, new Date(), GCAL_CACHE_FRESH_MS, GCAL_CACHE_EXPIRE_MS);
  return { usable: state !== "expired", stale: state === "stale" };
}

export interface MonthEventsResult {
  /** Events per calendar, keyed by Google calendar id (absent ids omitted). */
  events: Record<string, GcalEventItem[]>;
  /** True when every calendar was served from cache without a blocking Google refresh. */
  allServed: boolean;
}

export interface MonthEventsOptions {
  /**
   * Bypass every cache layer: block on fresh Google fetches for all calendars
   * (upserting the cache), even when fresh entries exist. Used by the
   * dashboard's one-shot force refresh.
   */
  force?: boolean;
}

/**
 * Cached month read across several department calendars. Layers:
 *
 * 1. L1 memory — checked first; hits are verified against L2 with a
 *    lightweight metadata-only `SELECT` (`calendar_google_id`, `fetched_at` —
 *    no `events` JSONB) so a cross-instance `invalidateGcalCache` (DELETE on
 *    another lambda) is visible everywhere without re-downloading whole month
 *    payloads on warm views. Stale entries schedule a background refresh via
 *    `after()`.
 * 2. L2 Postgres — full `events` rows are fetched only for L1 misses (one
 *    batched `SELECT` regardless of calendar count), plus the rare L1 hit
 *    whose shared row is newer than the local copy.
 * 3. blocking Google `events.list` + upsert for anything missing/expired or
 *    for L1 hits whose L2 row was deleted/expired elsewhere.
 *
 * Keyed by `(googleCalendarId, month)` so every user/filter combination on
 * `/dashboard` shares one entry. In-app mutations call
 * `invalidateGcalCache()` so edits appear instantly. Google errors propagate — a
 * failed refresh is never served as data.
 *
 * With `{ force: true }` (the dashboard's one-shot force refresh) every layer
 * is bypassed: all calendars block on a fresh Google fetch. Doing this inside
 * the same RSC request — rather than invalidating and re-reading — guarantees
 * the response carries the new data, since a plain re-read could be served by
 * another instance whose L1 still holds a warm entry.
 */
export async function getCachedMonthEventsForCalendars(
  googleCalendarIds: string[],
  month: string,
  options: MonthEventsOptions = {},
): Promise<MonthEventsResult> {
  const ids = [...new Set(googleCalendarIds)];
  const events: Record<string, GcalEventItem[]> = {};
  if (ids.length === 0) {
    return { events, allServed: true };
  }

  if (options.force) {
    // Force must always block on a genuinely new Google fetch, so bypass the
    // `inflight` coalescing that `refreshCachedMonth` would otherwise reuse —
    // a background stale-refresh (from `after()`) started before the edit could
    // otherwise be returned in place of fresh data.
    const refreshed = await mapWithConcurrency(ids, GOOGLE_FETCH_CONCURRENCY, async (id) => {
      const items = await refreshMonthEvents(id, month);
      return [id, items] as const;
    });
    for (const [id, items] of refreshed) {
      events[id] = items;
    }
    return { events, allServed: false };
  }

  let allServed = true;

  // Partition ids by L1 presence: hits may still be stale due to a
  // cross-instance invalidation (DELETE on another lambda's DB, invisible to
  // this lambda's Map). Every L1 hit is verified against the shared L2 row
  // with a lightweight metadata-only SELECT — `calendar_google_id` and
  // `fetched_at`, no `events` JSONB — so warm views keep their
  // cross-instance read-your-writes guarantee without re-downloading whole
  // month payloads.
  const l1Hits = new Map<string, MemoryEntry>();
  const l1MissIds: string[] = [];
  for (const id of ids) {
    const entry = memory.get(memoryKey(id, month));
    if (entry && entryState(entry) !== "expired") {
      l1Hits.set(id, entry);
    } else {
      l1MissIds.push(id);
    }
  }

  // One tiny batched SELECT: month + fetched_at per requested calendar (a
  // single roundtrip regardless of calendar count). Seeing no row for an L1
  // hit means the entry was invalidated elsewhere and must be re-fetched
  // blocking.
  const metaRows = await db
    .select({
      calendarGoogleId: googleEventCache.calendarGoogleId,
      fetchedAt: googleEventCache.fetchedAt,
    })
    .from(googleEventCache)
    .where(and(eq(googleEventCache.month, month), inArray(googleEventCache.calendarGoogleId, ids)));
  const metaById = new Map(metaRows.map((row) => [row.calendarGoogleId, row]));

  const pending: string[] = [];
  // The ids whose full `events` JSONB we actually need: every L1 miss with a
  // usable row, plus the rare L1 hit whose shared row is meaningfully newer
  // than the local copy. Fetched in one batched SELECT below.
  const needFullRow = new Set<string>();

  for (const [id, entry] of l1Hits) {
    const meta = metaById.get(id);
    if (!meta) {
      // L1 holds a value whose L2 row was deleted by invalidateGcalCache on
      // another instance — purge the local copy and treat as a blocking miss.
      memory.delete(memoryKey(id, month));
      inflight.delete(memoryKey(id, month));
      pending.push(id);
      continue;
    }
    const { usable, stale } = rowUsable(meta.fetchedAt);
    if (!usable) {
      memory.delete(memoryKey(id, month));
      inflight.delete(memoryKey(id, month));
      pending.push(id);
      continue;
    }
    if (stale || entryState(entry) === "stale") {
      after(() => {
        void refreshCachedMonth(id, month).catch(() => {});
      });
    }
    // If the shared L2 row is meaningfully newer than the local L1 copy (e.g.
    // another instance refreshed and upserted), prefer the fresher DB data so
    // external Google edits converge on the next request even though the
    // local L1 is still technically "fresh". A small tolerance avoids the
    // microsecond drift between a local refresh's L1 store and its own upsert.
    if (meta.fetchedAt.getTime() - entry.fetchedAt > ROW_NEWER_TOLERANCE_MS) {
      needFullRow.add(id);
    } else {
      events[id] = entry.events;
    }
  }

  for (const id of l1MissIds) {
    const meta = metaById.get(id);
    if (meta) {
      const { usable, stale } = rowUsable(meta.fetchedAt);
      if (usable) {
        if (stale) {
          after(() => {
            void refreshCachedMonth(id, month).catch(() => {});
          });
        }
        needFullRow.add(id);
      } else {
        pending.push(id);
      }
    } else {
      pending.push(id);
    }
  }

  if (needFullRow.size > 0) {
    const rows = await db
      .select()
      .from(googleEventCache)
      .where(
        and(
          eq(googleEventCache.month, month),
          inArray(googleEventCache.calendarGoogleId, [...needFullRow]),
        ),
      );
    const served = new Set<string>();
    for (const row of rows) {
      const decoded = decodeCachedEvents(row.events);
      // Inherit the row's age so L1 can't extend past GCAL_CACHE_EXPIRE_MS.
      remember(row.calendarGoogleId, month, decoded, row.fetchedAt.getTime());
      events[row.calendarGoogleId] = decoded;
      served.add(row.calendarGoogleId);
    }
    // A row that was usable in the metadata pass can be deleted by a
    // cross-instance invalidateGcalCache before this SELECT runs; treat any id
    // that came back empty as a blocking miss instead of silently omitting it.
    for (const id of needFullRow) {
      if (!served.has(id)) {
        pending.push(id);
      }
    }
  }

  if (pending.length > 0) {
    allServed = false;
    const refreshed = await mapWithConcurrency(pending, GOOGLE_FETCH_CONCURRENCY, async (id) => {
      const items = await refreshCachedMonth(id, month);
      return [id, items] as const;
    });
    for (const [id, items] of refreshed) {
      events[id] = items;
    }
  }

  return { events, allServed };
}

/**
 * Purge every cached Google Calendar month (L1 memory + in-flight + full DB
 * table).  Used by the admin "Purge Calendar Cache" button so the next view
 * cold-fetches everything from Google.
 */
export async function purgeGcalCache(): Promise<void> {
  memory.clear();
  inflight.clear();
  await db.delete(googleEventCache);
}

/**
 * Delete the Google month cache rows a mutation touched (DB + L1 + in-flight),
 * so the next view re-fetches and shows the change immediately. Over-invalidation
 * across the touched calendars and months is harmless.
 */
export async function invalidateGcalCache(
  googleCalendarIds: string[],
  months: string[],
): Promise<void> {
  const ids = [...new Set(googleCalendarIds)];
  const monthSet = [...new Set(months)];
  for (const id of ids) {
    for (const month of monthSet) {
      const key = memoryKey(id, month);
      memory.delete(key);
      inflight.delete(key);
    }
  }
  if (ids.length === 0 || monthSet.length === 0) {
    return;
  }
  await db
    .delete(googleEventCache)
    .where(
      and(
        inArray(googleEventCache.calendarGoogleId, ids),
        inArray(googleEventCache.month, monthSet),
      ),
    );
}

/**
 * Fetch a calendar's month from Google and store it in DB + L1 memory.
 *
 * The Google call runs outside any transaction so it never holds the (single)
 * Postgres connection open across the network round-trip — the app's pool is
 * `max: 1`, so a long-lived transaction here would serialize every other query
 * and stall the whole app. Concurrent callers for the same key are already
 * coalesced in-process by the `inflight` map; duplicate cross-instance
 * refreshes are harmless (the upsert is idempotent).
 */
async function refreshMonthEvents(
  googleCalendarId: string,
  month: string,
): Promise<GcalEventItem[]> {
  const integration = await getGoogleIntegration();
  const { start, end } = monthRange(month);
  const items = await integration.listEvents(googleCalendarId, start, end);
  const events = encodeCachedEvents(items);
  await db
    .insert(googleEventCache)
    .values({
      calendarGoogleId: googleCalendarId,
      month,
      events,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [googleEventCache.calendarGoogleId, googleEventCache.month],
      set: { events, fetchedAt: new Date() },
    });
  remember(googleCalendarId, month, items);
  return items;
}
