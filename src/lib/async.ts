/**
 * Bounded-concurrency map. Runs `fn` over `items` with at most `limit`
 * promises in flight, preserving input order in the result (slot-per-index,
 * so later callers never observe gaps or reordering).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(0, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** One failed item from {@link mapSettled}, with its input position preserved. */
export interface SettledFailure {
  index: number;
  error: unknown;
}

/** Result of {@link mapSettled}: successful values (slot-per-index) + failures. */
export interface SettledMapResult<R> {
  /** Successful results, aligned to the input order (`undefined` where the item threw). */
  results: (R | undefined)[];
  /** Every item that threw, ordered by input index. */
  failures: SettledFailure[];
}

/**
 * Bounded-concurrency map that runs **every** item even when some throw,
 * collecting the failures instead of rejecting on the first one.
 *
 * Use this for fan-out with externally visible side effects (the event write
 * pipeline's per-calendar Google copies): a caller that must undo the copies
 * that succeeded cannot do so until every sibling worker has settled — a
 * rejecting `Promise.all` would resolve early while other writes were still in
 * flight, leaking copies the rollback never saw.
 */
export async function mapSettled<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<SettledMapResult<R>> {
  const results = new Array<R | undefined>(items.length);
  const failures: SettledFailure[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.max(0, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        failures.push({ index, error });
      }
    }
  });
  await Promise.all(workers);
  failures.sort((a, b) => a.index - b.index);
  return { results, failures };
}

/**
 * Reject a promise if it hasn't settled within `ms`. The underlying operation
 * keeps running (there is no cancellation), but callers that only need to stop
 * *waiting* — a best-effort readiness leg, a first-load screen that must not
 * hang forever — can move on. The timer is cleared as soon as the promise
 * settles either way.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer: ReturnType<typeof setTimeout> = setTimeout(
      () => reject(new Error(`Timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
