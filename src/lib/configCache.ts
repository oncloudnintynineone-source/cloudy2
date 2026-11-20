import { getCachedValue, invalidateCachedValue } from "@/lib/cache";

/**
 * TTL for the rarely-changing, user-independent reference reads: calendars
 * (departments), users, event types/groups, the settings row, event-title
 * templates, and quick links.
 *
 * These are re-read on every dashboard config pass (`resolveDashboardConfig`),
 * which runs twice per launch (the active read and the tab preload) because the
 * two are separate API requests and React's per-request `cache()` can't span
 * them. They change only on admin writes, so a short window trades a bounded
 * per-instance staleness for removing most of a render's DB round trips — the
 * binding constraint (`docs/neon-usage.md`). 60s matches the events cache's
 * fresh window. Per-instance and best-effort, exactly like the pinned cache
 * (`src/lib/cache.ts`); failures are never cached.
 */
export const CONFIG_CACHE_TTL_MS = 60_000;

/**
 * One key per cached read. Deliberately centralized so the set of cached config
 * reads is auditable in one place (and a future explicit invalidation could
 * target them by name).
 */
export const CONFIG_CACHE_KEYS = {
  calendars: "config:calendars",
  eventTypes: "config:eventTypes",
  eventTypeGroups: "config:eventTypeGroups",
  users: "config:users",
  settings: "config:settings",
  eventTitleTemplates: "config:eventTitleTemplates",
  quickLinks: "config:quickLinks",
} as const;

/** A key of the config cache (the auditable set of cached reads). */
export type ConfigCacheKey = keyof typeof CONFIG_CACHE_KEYS;

/**
 * Cached read for one config key. Uses the shared 60s TTL; callers that also
 * need per-request dedupe wrap the returned promise with React's `cache()`.
 */
export function cachedConfig<K extends ConfigCacheKey, T>(
  key: K,
  loader: () => Promise<T>,
): Promise<T> {
  return getCachedValue(CONFIG_CACHE_KEYS[key], CONFIG_CACHE_TTL_MS, loader);
}

/**
 * Drop the in-memory TTL entries for the given config keys (all when omitted),
 * so an admin write is visible on the very next read instead of after
 * `CONFIG_CACHE_TTL_MS`. Call this beside the `revalidatePath(...)` calls in
 * every admin mutation that changes one of the cached reads.
 *
 * Per-instance and best-effort, exactly like the cache itself: it clears the
 * instance that served the write; other instances converge when their TTL
 * expires.
 */
export function invalidateConfigCache(
  keys: readonly (keyof typeof CONFIG_CACHE_KEYS)[] = Object.keys(
    CONFIG_CACHE_KEYS,
  ) as (keyof typeof CONFIG_CACHE_KEYS)[],
): void {
  for (const key of keys) {
    invalidateCachedValue(CONFIG_CACHE_KEYS[key]);
  }
}
