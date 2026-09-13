/**
 * Refcounted activity bookkeeping for the global activity bar
 * (docs/loading-transitions.md §1.13).
 *
 * Multiple overlapping sources (a route nav mid-refresh, an in-page transition
 * plus a cold-start leg) report busy-ness by key. A key is busy while its count
 * is >= 1, and the bar shows while *any* key is busy. Keeping the arithmetic
 * here — pure and free of React/DOM — lets it be unit-tested directly, and
 * makes the "every `begin` must be matched by an `end`, including on unmount"
 * invariant explicit.
 */

export type ActivityCounts = Readonly<Record<string, number>>;

/** Increment a key's count (idempotent-safe: repeated begins stack). */
export function beginActivity(counts: ActivityCounts, key: string): ActivityCounts {
  return { ...counts, [key]: (counts[key] ?? 0) + 1 };
}

/**
 * Decrement a key's count, dropping it once it reaches zero. An `end` for an
 * unknown key is a no-op, so a double-release (e.g. a falling edge followed by
 * an unmount cleanup) can never drive a count negative.
 */
export function endActivity(counts: ActivityCounts, key: string): ActivityCounts {
  const remaining = (counts[key] ?? 1) - 1;
  if (remaining > 0) {
    return { ...counts, [key]: remaining };
  }
  if (!(key in counts)) {
    return counts;
  }
  const next = { ...counts };
  delete next[key];
  return next;
}

/** Whether any key is currently busy (drives the bar itself). */
export function isActivityBusy(counts: ActivityCounts): boolean {
  return Object.keys(counts).length > 0;
}
