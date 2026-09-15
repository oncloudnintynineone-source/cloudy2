import { and, eq, inArray, sql } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { cacheInvalidation, googleEventCache } from "@/db/schema";
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

/**
 * Whether this process has confirmed the epoch row exists. The row is created
 * once and never deleted (only ever bumped), so the `INSERT … ON CONFLICT DO
 * NOTHING` only needs to run once per process — not on every epoch read. The
 * epoch is read twice per Google refresh (before and after the fetch, to detect
 * a cross-instance invalidation mid-flight) and once per mutation, per
 * calendar/month, so the redundant INSERTs added up on exactly the cold path.
 */
let epochRowEnsured = false;

/** Lazily ensure the single-row cache epoch marker exists. */
async function ensureCacheEpoch(): Promise<void> {
  if (epochRowEnsured) {
    return;
  }
  await db
    .insert(cacheInvalidation)
    .values({ id: "singleton", epoch: 0 })
    .onConflictDoNothing();
  epochRowEnsured = true;
}

/** The current cache invalidation epoch (0 when the row is absent). */
async function readCacheEpoch(): Promise<number> {
  await ensureCacheEpoch();
  const [row] = await db
    .select({ epoch: cacheInvalidation.epoch })
    .from(cacheInvalidation)
    .where(eq(cacheInvalidation.id, "singleton"))
    .limit(1);
  return row?.epoch ?? 0;
}

/** Advance the invalidation epoch so in-flight refreshes that started earlier
 *  refuse to persist a possibly-stale snapshot (see `refreshMonthEvents`). */
async function bumpCacheEpoch(): Promise<void> {
  await ensureCacheEpoch();
  await db
    .update(cacheInvalidation)
    .set({ epoch: sql`${cacheInvalidation.epoch} + 1`, updatedAt: new Date() })
    .where(eq(cacheInvalidation.id, "singleton"));
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

export interface MultiMonthEventsResult {
  /** Events per calendar per month, keyed by `month` then Google calendar id. */
  events: Record<string, Record<string, GcalEventItem[]>>;
  /** True when every calendar/month was served from cache without a blocking Google refresh. */
  allServed: boolean;
}

/**
 * Cached month reads across several department calendars and months. Layers:
 *
 * 1. L1 memory — checked first; hits are verified against L2 with a
 *    lightweight metadata-only `SELECT` (`calendar_google_id`, `fetched_at` —
 *    no `events` JSONB) so a cross-instance `invalidateGcalCache` (DELETE on
 *    another lambda) is visible everywhere without re-downloading whole month
 *    payloads on warm views. Stale entries schedule a background refresh via
 *    `after()`.
 * 2. L2 Postgres — full `events` rows are fetched only for L1 misses, plus the
 *    rare L1 hit whose shared row is newer than the local copy.
 * 3. blocking Google `events.list` + upsert for anything missing/expired or
 *    for L1 hits whose L2 row was deleted/expired elsewhere.
 *
 * Keyed by `(googleCalendarId, month)` so every user/filter combination on
 * `/dashboard` shares one entry. In-app mutations call
 * `invalidateGcalCache()` so edits appear instantly. Google errors propagate — a
 * failed refresh is never served as data.
 *
 * Unlike the single-month entry point, the metadata and full-row `SELECT`s are
 * **batched across all requested months** (one round-trip each) — the Month
 * grid reads 2-3 months, so this collapses 2-3 metadata round-trips into one.
 *
 * With `{ force: true }` (the dashboard's one-shot force refresh) every layer
 * is bypassed: all calendars block on a fresh Google fetch. Doing this inside
 * the same RSC request — rather than invalidating and re-reading — guarantees
 * the response carries the new data, since a plain re-read could be served by
 * another instance whose L1 still holds a warm entry.
 */
export async function getCachedMonthEventsForCalendarsMulti(
  googleCalendarIds: string[],
  months: string[],
  options: MonthEventsOptions = {},
): Promise<MultiMonthEventsResult> {
  const ids = [...new Set(googleCalendarIds)];
  const monthList = [...new Set(months)];
  const events: Record<string, Record<string, GcalEventItem[]>> = {};
  for (const month of monthList) {
    events[month] = {};
  }
  if (ids.length === 0 || monthList.length === 0) {
    return { events, allServed: true };
  }

  if (options.force) {
    // Force must always block on a genuinely new Google fetch, so bypass the
    // `inflight` coalescing that `refreshCachedMonth` would otherwise reuse —
    // a background stale-refresh (from `after()`) started before the edit could
    // otherwise be returned in place of fresh data.
    await mapWithConcurrency(monthList, GOOGLE_FETCH_CONCURRENCY, async (month) => {
      const refreshed = await mapWithConcurrency(ids, GOOGLE_FETCH_CONCURRENCY, async (id) => {
        const items = await refreshMonthEvents(id, month);
        return [id, items] as const;
      });
      for (const [id, items] of refreshed) {
        events[month][id] = items;
      }
    });
    return { events, allServed: false };
  }

  let allServed = true;

  // Partition ids per month by L1 presence: hits may still be stale due to a
  // cross-instance invalidation (DELETE on another lambda's DB, invisible to
  // this lambda's Map). Every L1 hit is verified against the shared L2 row
  // with a lightweight metadata-only SELECT — `calendar_google_id` and
  // `fetched_at`, no `events` JSONB — so warm views keep their
  // cross-instance read-your-writes guarantee without re-downloading whole
  // month payloads.
  const l1Hits = new Map<string, Map<string, MemoryEntry>>();
  const l1MissIds = new Map<string, string[]>();
  for (const month of monthList) {
    l1Hits.set(month, new Map());
    l1MissIds.set(month, []);
  }
  for (const month of monthList) {
    for (const id of ids) {
      const entry = memory.get(memoryKey(id, month));
      if (entry && entryState(entry) !== "expired") {
        l1Hits.get(month)!.set(id, entry);
      } else {
        l1MissIds.get(month)!.push(id);
      }
    }
  }

  // ONE batched metadata SELECT across all (month, calendar) pairs (a single
  // round-trip regardless of calendar/month count). Seeing no row for an L1
  // hit means the entry was invalidated elsewhere and must be re-fetched
  // blocking.
  const metaRows = await db
    .select({
      month: googleEventCache.month,
      calendarGoogleId: googleEventCache.calendarGoogleId,
      fetchedAt: googleEventCache.fetchedAt,
    })
    .from(googleEventCache)
    .where(
      and(
        inArray(googleEventCache.month, monthList),
        inArray(googleEventCache.calendarGoogleId, ids),
      ),
    );
  const metaByKey = new Map(
    metaRows.map((row) => [`${row.month}:${row.calendarGoogleId}`, row]),
  );

  const pending = new Map<string, string[]>();
  const needFullRow = new Map<string, string[]>();
  for (const month of monthList) {
    pending.set(month, []);
    needFullRow.set(month, []);
  }

  for (const month of monthList) {
    for (const [id, entry] of l1Hits.get(month)!) {
      const meta = metaByKey.get(`${month}:${id}`);
      if (!meta) {
        // L1 holds a value whose L2 row was deleted by invalidateGcalCache on
        // another instance — purge the local copy and treat as a blocking miss.
        memory.delete(memoryKey(id, month));
        inflight.delete(memoryKey(id, month));
        pending.get(month)!.push(id);
        continue;
      }
      const { usable, stale } = rowUsable(meta.fetchedAt);
      if (!usable) {
        memory.delete(memoryKey(id, month));
        inflight.delete(memoryKey(id, month));
        pending.get(month)!.push(id);
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
        needFullRow.get(month)!.push(id);
      } else {
        events[month][id] = entry.events;
      }
    }

    for (const id of l1MissIds.get(month)!) {
      const meta = metaByKey.get(`${month}:${id}`);
      if (meta) {
        const { usable, stale } = rowUsable(meta.fetchedAt);
        if (usable) {
          if (stale) {
            after(() => {
              void refreshCachedMonth(id, month).catch(() => {});
            });
          }
          needFullRow.get(month)!.push(id);
        } else {
          pending.get(month)!.push(id);
        }
      } else {
        pending.get(month)!.push(id);
      }
    }
  }

  // ONE batched full-row SELECT across all months for the ids that need their
  // JSONB (a single round-trip regardless of calendar/month count).
  const needFullRowKeys = new Set<string>();
  const needFullRowIds = new Set<string>();
  for (const month of monthList) {
    for (const id of needFullRow.get(month)!) {
      needFullRowKeys.add(`${month}:${id}`);
      needFullRowIds.add(id);
    }
  }
  if (needFullRowKeys.size > 0) {
    const rows = await db
      .select()
      .from(googleEventCache)
      .where(
        and(
          inArray(googleEventCache.month, monthList),
          inArray(googleEventCache.calendarGoogleId, [...needFullRowIds]),
        ),
      );
    const served = new Set<string>();
    for (const row of rows) {
      const key = `${row.month}:${row.calendarGoogleId}`;
      if (!needFullRowKeys.has(key)) {
        continue;
      }
      const decoded = decodeCachedEvents(row.events);
      // Inherit the row's age so L1 can't extend past GCAL_CACHE_EXPIRE_MS.
      remember(row.calendarGoogleId, row.month, decoded, row.fetchedAt.getTime());
      events[row.month][row.calendarGoogleId] = decoded;
      served.add(key);
    }
    // A row that was usable in the metadata pass can be deleted by a
    // cross-instance invalidateGcalCache before this SELECT runs; treat any id
    // that came back empty as a blocking miss instead of silently omitting it.
    for (const month of monthList) {
      for (const id of needFullRow.get(month)!) {
        if (!served.has(`${month}:${id}`)) {
          pending.get(month)!.push(id);
        }
      }
    }
  }

  for (const month of monthList) {
    const monthPending = pending.get(month)!;
    if (monthPending.length === 0) {
      continue;
    }
    allServed = false;
    const refreshed = await mapWithConcurrency(monthPending, GOOGLE_FETCH_CONCURRENCY, async (id) => {
      const items = await refreshCachedMonth(id, month);
      return [id, items] as const;
    });
    for (const [id, items] of refreshed) {
      events[month][id] = items;
    }
  }

  return { events, allServed };
}

/**
 * Cached month read across several department calendars (single month). Thin
 * wrapper over {@link getCachedMonthEventsForCalendarsMulti} for the
 * Day/Agenda/parade-state single-month callers.
 */
export async function getCachedMonthEventsForCalendars(
  googleCalendarIds: string[],
  month: string,
  options: MonthEventsOptions = {},
): Promise<MonthEventsResult> {
  const result = await getCachedMonthEventsForCalendarsMulti(googleCalendarIds, [month], options);
  return { events: result.events[month] ?? {}, allServed: result.allServed };
}

/**
 * Purge every cached Google Calendar month (L1 memory + in-flight + full DB
 * table).  Used by the admin "Purge Calendar Cache" button so the next view
 * cold-fetches everything from Google.
 */
export async function purgeGcalCache(): Promise<void> {
  await bumpCacheEpoch();
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
  // Bump the epoch first: any background refresh that started before this
  // invalidation will see the advanced epoch on its post-fetch check and skip
  // persisting a snapshot that predates the mutation (see `refreshMonthEvents`).
  await bumpCacheEpoch();
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
 * The Google call runs outside any transaction so it never holds a Postgres
 * connection open across the network round-trip — the app's pool is small
 * (`DB_POOL_MAX`, default 3), so a long-lived transaction here would serialize
 * every other query and stall the whole app. Concurrent callers for the same key are already
 * coalesced in-process by the `inflight` map; duplicate cross-instance
 * refreshes are harmless (the upsert is idempotent).
 */
async function refreshMonthEvents(
  googleCalendarId: string,
  month: string,
): Promise<GcalEventItem[]> {
  // Snapshot the invalidation epoch before the Google call. If it advanced by
  // the time the fetch returns, an `invalidateGcalCache` ran on another
  // instance while this fetch was in flight — the items may predate the
  // mutation, so persist nothing (L1 or DB); return them only to this caller.
  const epochAtStart = await readCacheEpoch();
  const integration = await getGoogleIntegration();
  const { start, end } = monthRange(month);
  const items = await integration.listEvents(googleCalendarId, start, end);
  if ((await readCacheEpoch()) !== epochAtStart) {
    return items;
  }
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
