/**
 * Pure helpers for the per-user event-search history. The history is a bounded
 * string list (most-recent-first, case-insensitively deduped) persisted on
 * `user_preferences.search_history` and surfaced in the search modal as
 * tappable "Recent searches" badges. These helpers are I/O-free so the list
 * arithmetic is unit-testable.
 */

/** How many recent queries are kept (and shown) per user. */
export const SEARCH_HISTORY_MAX = 8;

/**
 * Coerce a stored/unknown value into a clean history list: non-empty strings
 * only, each trimmed, junk entries dropped. `null`/non-arrays become `[]`.
 */
export function cleanSearchHistoryList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Prepend a newly-searched query to the history: trimmed, deduped against the
 * existing list case-insensitively (the fresh copy moves to the front), and
 * capped at `SEARCH_HISTORY_MAX`. An empty/whitespace query returns the list
 * unchanged.
 */
export function addSearchHistoryEntry(list: string[], query: string): string[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return cleanSearchHistoryList(list);
  }
  const key = trimmed.toLowerCase();
  const rest = cleanSearchHistoryList(list).filter(
    (entry) => entry.toLowerCase() !== key,
  );
  return [trimmed, ...rest].slice(0, SEARCH_HISTORY_MAX);
}

/**
 * Remove a query (and its case-insensitive duplicates) from the history.
 */
export function removeSearchHistoryEntry(list: string[], query: string): string[] {
  const key = query.trim().toLowerCase();
  if (key.length === 0) {
    return cleanSearchHistoryList(list);
  }
  return cleanSearchHistoryList(list).filter(
    (entry) => entry.toLowerCase() !== key,
  );
}
