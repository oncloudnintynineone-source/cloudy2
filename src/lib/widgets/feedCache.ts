/**
 * Durable cache for the rendered calendar-feed body (docs/calendar-feed.md).
 *
 * A feed covers ±3 months, so rebuilding it on every calendar-app poll would
 * read up to eight months per request. The rendered ICS is cached per
 * `(user, view)`:
 *
 * - fresh for {@link WIDGET_FEED_CACHE_TTL_MS} while the events-cache epoch is
 *   unchanged → served directly;
 * - otherwise the current body is still served and the rebuild runs in
 *   `after()`, so the poll never blocks on Google (the pinned-cache pattern).
 *   A missing row rebuilds blocking.
 *
 * Event mutations bump the events-cache epoch, so the next read rebuilds.
 * Dashboard-view edits call {@link invalidateWidgetFeedCacheForUser} directly.
 * The body is the ICS only — no credential is stored.
 */

import { and, eq } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { widgetFeedCache } from "@/db/schema";
import { readCacheEpoch } from "@/lib/google/eventsCache";

import { buildCalendarFeed, type WidgetActor } from "./feed";

/** How long a rendered feed body is considered fresh. */
export const WIDGET_FEED_CACHE_TTL_MS = 15 * 60_000;

interface CachedFeedRow {
  body: string;
  fetchedAt: Date;
  epoch: number;
}

/** Pure freshness check (epoch match + TTL), unit-tested with an injected clock. */
export function feedCacheIsFresh(
  fetchedAt: Date,
  storedEpoch: number,
  currentEpoch: number,
  nowMs: number = Date.now(),
): boolean {
  return storedEpoch === currentEpoch && nowMs - fetchedAt.getTime() < WIDGET_FEED_CACHE_TTL_MS;
}

function cacheKey(userId: string, viewId: string): string {
  return `${userId}:${viewId}`;
}

/** Coalesces concurrent rebuilds within this process. */
const inflight = new Map<string, Promise<string>>();

async function readCachedFeed(userId: string, viewId: string): Promise<CachedFeedRow | null> {
  const [row] = await db
    .select({
      body: widgetFeedCache.body,
      fetchedAt: widgetFeedCache.fetchedAt,
      epoch: widgetFeedCache.epoch,
    })
    .from(widgetFeedCache)
    .where(and(eq(widgetFeedCache.userId, userId), eq(widgetFeedCache.viewId, viewId)))
    .limit(1);
  return row ?? null;
}

async function rebuildAndPersist(params: {
  actor: WidgetActor;
  viewId: string;
  origin: string;
}): Promise<string> {
  const epochAtStart = await readCacheEpoch();
  const built = await buildCalendarFeed(params);
  // Refuse to persist a body whose scan raced an event mutation; the caller
  // still receives it, and the next read rebuilds.
  if ((await readCacheEpoch()) === epochAtStart) {
    const fetchedAt = new Date();
    await db
      .insert(widgetFeedCache)
      .values({
        userId: params.actor.id,
        viewId: params.viewId,
        body: built.body,
        epoch: epochAtStart,
        fetchedAt,
      })
      .onConflictDoUpdate({
        target: [widgetFeedCache.userId, widgetFeedCache.viewId],
        set: { body: built.body, epoch: epochAtStart, fetchedAt },
      });
  }
  return built.body;
}

function coalescedRebuild(params: {
  actor: WidgetActor;
  viewId: string;
  origin: string;
}): Promise<string> {
  const key = cacheKey(params.actor.id, params.viewId);
  const running = inflight.get(key);
  if (running) {
    return running;
  }
  const promise = rebuildAndPersist(params).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

/**
 * The ICS body for a feed request. Serves a fresh cache hit, otherwise serves
 * the stale body and rebuilds in `after()`; a cold cache rebuilds blocking.
 */
export async function buildCalendarFeedCached(params: {
  actor: WidgetActor;
  viewId: string;
  origin: string;
}): Promise<string> {
  const [cached, epoch] = await Promise.all([
    readCachedFeed(params.actor.id, params.viewId),
    readCacheEpoch(),
  ]);

  if (cached && feedCacheIsFresh(cached.fetchedAt, cached.epoch, epoch)) {
    return cached.body;
  }

  if (cached) {
    after(() => {
      void coalescedRebuild(params).catch((error) => {
        console.error("[widgets] Calendar feed rebuild failed", error);
      });
    });
    return cached.body;
  }

  return coalescedRebuild(params);
}

/** Drop a user's cached feed bodies (dashboard-view name/filter/kind/delete edits). */
export async function invalidateWidgetFeedCacheForUser(userId: string): Promise<void> {
  try {
    await db.delete(widgetFeedCache).where(eq(widgetFeedCache.userId, userId));
  } catch (error) {
    console.error("[widgets] Failed to invalidate calendar feed cache", error);
  }
}
