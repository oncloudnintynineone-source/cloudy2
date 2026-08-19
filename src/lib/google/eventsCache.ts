import { and, eq } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { googleEventCache } from "@/db/schema";
import { monthRange } from "@/lib/events/datetime";
import { getGoogleIntegration } from "./index";
import {
  cacheEntryState,
  decodeCachedEvents,
  encodeCachedEvents,
} from "./eventsCacheCodec";
import type { GcalEventItem } from "./types";

/** Serve cached month data directly for this long. */
export const GCAL_CACHE_FRESH_MS = 30_000;

/** Hard expire: stale entries are refreshed in the background until this age. */
export const GCAL_CACHE_EXPIRE_MS = 30 * 60_000;

/**
 * Cached month read of one department calendar. The Postgres `google_event_cache`
 * table is the layer between the frontend and the Google Calendar API: repeat
 * views of a month skip Google entirely, while the TTL keeps out-of-band Google
 * edits converging within ~30s (stale-while-revalidate via `after()`).
 *
 * Keyed by `(googleCalendarId, month)` so every user/filter combination on both
 * `/dashboard` and `/overview` shares one entry. In-app mutations delete the
 * affected rows in `src/lib/events/actions.ts` (`invalidateGcalCache`) so edits
 * appear instantly. Google errors propagate — a failed refresh is never served
 * as data.
 */
export async function getCachedMonthEvents(
  googleCalendarId: string,
  month: string,
): Promise<GcalEventItem[]> {
  const [row] = await db
    .select()
    .from(googleEventCache)
    .where(
      and(
        eq(googleEventCache.calendarGoogleId, googleCalendarId),
        eq(googleEventCache.month, month),
      ),
    )
    .limit(1);

  if (row) {
    const state = cacheEntryState(
      row.fetchedAt,
      new Date(),
      GCAL_CACHE_FRESH_MS,
      GCAL_CACHE_EXPIRE_MS,
    );
    if (state === "fresh" || state === "stale") {
      // Serve stale data now and refresh the entry after the response ships.
      if (state === "stale") {
        after(() => {
          void refreshMonthEvents(googleCalendarId, month).catch(() => {});
        });
      }
      return decodeCachedEvents(row.events);
    }
  }

  // Missing or expired — blocking refresh so the response is fresh.
  return refreshMonthEvents(googleCalendarId, month);
}

/** Fetch a calendar's month from Google and upsert the cache entry. */
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
  return items;
}
