/**
 * Small fixed-window rate limiter for the widget API. Widgets refresh only
 * when the user taps their refresh button, so this is a burst guard against a
 * leaked URL, not a quota. Per-instance and best-effort by design: Cloud Run
 * may run several instances, and a shared counter is not worth a DB write on
 * every widget read.
 *
 * The window math is pure and clock-injected so it is unit-tested without
 * timers or a database.
 */

export interface RateLimitBucket {
  windowStart: number;
  count: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the current window resets (only meaningful when denied). */
  retryAfterSec: number;
}

/** Widget requests allowed per token per window. */
export const WIDGET_RATE_LIMIT = 60;
export const WIDGET_RATE_WINDOW_MS = 60_000;

/**
 * Consume one request against `key`. A window older than `windowMs` (or a
 * clock that moved backwards) starts fresh.
 */
export function consumeRateLimit(
  buckets: Map<string, RateLimitBucket>,
  key: string,
  now: number,
  limit: number = WIDGET_RATE_LIMIT,
  windowMs: number = WIDGET_RATE_WINDOW_MS,
): RateLimitDecision {
  const current = buckets.get(key);
  if (!current || now - current.windowStart >= windowMs || now < current.windowStart) {
    buckets.set(key, { windowStart: now, count: 1 });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (current.count < limit) {
    current.count += 1;
    return { allowed: true, retryAfterSec: 0 };
  }
  const retryAfterMs = windowMs - (now - current.windowStart);
  return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
}

/** Drop expired buckets so the map cannot grow without bound. */
export function pruneRateLimitBuckets(
  buckets: Map<string, RateLimitBucket>,
  now: number,
  windowMs: number = WIDGET_RATE_WINDOW_MS,
): void {
  if (buckets.size < 1_000) {
    return;
  }
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= windowMs) {
      buckets.delete(key);
    }
  }
}

const buckets = new Map<string, RateLimitBucket>();

/** Production entry point: one decision for a token hash. */
export function checkWidgetRateLimit(tokenHash: string, now: number = Date.now()): RateLimitDecision {
  pruneRateLimitBuckets(buckets, now);
  return consumeRateLimit(buckets, tokenHash, now);
}
