interface TtlEntry<T> {
  value: T;
  fetchedAt: number;
}

const store = new Map<string, TtlEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/** Simple cap so an idle instance can't grow the store without bound. */
const MAX_ENTRIES = 32;

/**
 * In-memory TTL cache for global (user-independent) reads — e.g. the pinned
 * events count/list, which are the same for every user and change only on
 * event CRUD. Mirrors the events cache's L1 pattern: per-instance and
 * best-effort, with in-flight coalescing so a burst of callers shares one
 * load. Failed loads are never cached. Callers that need mutation-time
 * freshness call `invalidateCachedValue` alongside their existing
 * invalidation.
 */
export function getCachedValue<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const existing = store.get(key);
  if (existing && Date.now() - existing.fetchedAt < ttlMs) {
    return Promise.resolve(existing.value as T);
  }
  const pending = inflight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }
  const promise = loader()
    .then((value) => {
      store.set(key, { value, fetchedAt: Date.now() });
      if (store.size > MAX_ENTRIES) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) {
          store.delete(oldest);
        }
      }
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

/** Drop a cached value (and any in-flight load) so the next read reloads. */
export function invalidateCachedValue(key: string): void {
  store.delete(key);
  inflight.delete(key);
}