"use client";

import { getEventHistory, type EventHistoryResult } from "@/lib/events/historyActions";

/**
 * Session-lifetime cache behind the history modal's instant open
 * (docs/event-history.md §1.3): rows are prefetched on row hover/press and
 * reused on open, while the modal still revalidates in the background so a
 * stale cache never sticks. A rejected fetch is evicted so the next attempt
 * retries. Cleared on sign-out (`clearEventHistoryCache`) so the next account
 * on the same tab never paints the previous user's history.
 */
const cache = new Map<string, Promise<EventHistoryResult>>();

function remember(eventId: string): Promise<EventHistoryResult> {
  const existing = cache.get(eventId);
  if (existing) {
    return existing;
  }
  const promise = getEventHistory(eventId);
  cache.set(eventId, promise);
  promise.catch(() => {
    if (cache.get(eventId) === promise) {
      cache.delete(eventId);
    }
  });
  return promise;
}

/** Whether rows for this event are already cached (open can paint instantly). */
export function hasCachedEventHistory(eventId: string): boolean {
  return cache.has(eventId);
}

/** Warm the cache for an event — fire-and-forget from hover/press handlers. */
export function prefetchEventHistory(eventId: string): void {
  void remember(eventId);
}

/** Cached-or-fetch read used by the modal's first paint. */
export function getCachedEventHistory(eventId: string): Promise<EventHistoryResult> {
  return remember(eventId);
}

/** Store a fresh background-revalidation result for future opens. */
export function storeCachedEventHistory(eventId: string, result: EventHistoryResult): void {
  cache.set(eventId, Promise.resolve(result));
}

/** Drop every cached trail — called on sign-out so the next account on the
 * same tab never paints the previous user's history. */
export function clearEventHistoryCache(): void {
  cache.clear();
}
