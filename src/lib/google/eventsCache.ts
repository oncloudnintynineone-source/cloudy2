import { and, eq, inArray } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { googleEventCache } from "@/db/schema";
import { mapWithConcurrency } from "@/lib/async";
import { monthRange } from "@/lib/events/datetime";
import { getGoogleIntegration } from "./index";
import {
  cacheEntryState,
  decodeCachedEvents,
  encodeCachedEvents,
} from "./eventsCacheCodec";
import type { GcalEventItem } from "./types";

/** Serve cached month data directly for this long. */
export const GCAL_CACHE_FRESH_MS = 60_000;

/** Hard expire: stale entries are refreshed in the background until this age. */
export const GCAL_CACHE_EXPIRE_MS = 30 * 60_000;

/** Max Google `events.list` calls in flight for a cold refresh (bounded for quota). */
const GOOGLE_FETCH_CONCURRENCY = 4;

/** Simple cap so an idle instance can't grow the L1 map without bound. */
const MAX_MEMORY_ENTRIES = 512;

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
 * 1. L1 memory — served with no I/O at all (stale entries schedule a background
 *    refresh via `after()`);
 * 2. L2 Postgres — a single batched `SELECT` for the whole month (~one
 *    round-trip regardless of calendar count), served the same way;
 * 3. blocking Google `events.list` + upsert for anything missing/expired.
 *
 * Keyed by `(googleCalendarId, month)` so every user/filter combination on both
 * `/dashboard` and `/overview` shares one entry. In-app mutations call
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
    const refreshed = await mapWithConcurrency(ids, GOOGLE_FETCH_CONCURRENCY, async (id) => {
      const items = await refreshCachedMonth(id, month);
      return [id, items] as const;
    });
    for (const [id, items] of refreshed) {
      events[id] = items;
    }
    return { events, allServed: false };
  }

  let allServed = true;
  const missing: string[] = [];

  for (const id of ids) {
    const entry = memory.get(memoryKey(id, month));
    if (entry) {
      const state = entryState(entry);
      if (state !== "expired") {
        if (state === "stale") {
          after(() => {
            void refreshCachedMonth(id, month).catch(() => {});
          });
        }
        events[id] = entry.events;
        continue;
      }
    }
    missing.push(id);
  }

  if (missing.length > 0) {
    const rows = await db
      .select()
      .from(googleEventCache)
      .where(
        and(
          eq(googleEventCache.month, month),
          inArray(googleEventCache.calendarGoogleId, missing),
        ),
      );
    const rowById = new Map(rows.map((row) => [row.calendarGoogleId, row]));
    const pending: string[] = [];

    for (const id of missing) {
      const row = rowById.get(id);
      if (row) {
        const { usable, stale } = rowUsable(row.fetchedAt);
        if (usable) {
          if (stale) {
            after(() => {
              void refreshCachedMonth(id, month).catch(() => {});
            });
          }
          const decoded = decodeCachedEvents(row.events);
          // Inherit the row's age so L1 can't extend past GCAL_CACHE_EXPIRE_MS.
          remember(id, month, decoded, row.fetchedAt.getTime());
          events[id] = decoded;
        } else {
          pending.push(id);
        }
      } else {
        pending.push(id);
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
  }

  return { events, allServed };
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

/** Fetch a calendar's month from Google and store it in DB + L1 memory. */
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
