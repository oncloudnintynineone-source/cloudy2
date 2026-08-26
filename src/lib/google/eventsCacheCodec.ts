import type { GcalEventItem } from "./types";

/**
 * Pure helpers for the Google Calendar events cache. Kept free of Next/db
 * imports so they are unit-testable; the DB-backed cache read/write lives in
 * `src/lib/google/eventsCache.ts`.
 */

/** Freshness of a cache entry for stale-while-revalidate handling. */
export type CacheEntryState = "fresh" | "stale" | "expired";

/**
 * Classify a cache entry by age. `freshMs` is how long the entry is served
 * directly; between `freshMs` and `expireMs` it is "stale" (served while a
 * background refresh runs); at or beyond `expireMs` it must be re-fetched
 * before serving.
 */
export function cacheEntryState(
  fetchedAt: Date,
  now: Date,
  freshMs: number,
  expireMs: number,
): CacheEntryState {
  const age = now.getTime() - fetchedAt.getTime();
  if (age < freshMs) {
    return "fresh";
  }
  if (age < expireMs) {
    return "stale";
  }
  return "expired";
}

interface CachedEvent {
  id: string;
  calendarId: string;
  title: string;
  description: string;
  allDay: boolean;
  location: string;
  start: string;
  end: string;
}

/** Encode `GcalEventItem`s for JSON storage (dates as ISO strings). */
export function encodeCachedEvents(items: GcalEventItem[]): CachedEvent[] {
  return items.map((item) => ({
    id: item.id,
    calendarId: item.calendarId,
    title: item.title,
    description: item.description,
    allDay: item.allDay,
    location: item.location,
    start: item.start.toISOString(),
    end: item.end.toISOString(),
  }));
}

/** Decode stored cache entries back into `GcalEventItem`s; malformed rows are dropped. */
export function decodeCachedEvents(raw: unknown): GcalEventItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const items: GcalEventItem[] = [];
  for (const value of raw) {
    if (typeof value !== "object" || value === null) {
      continue;
    }
    const entry = value as Record<string, unknown>;
    if (
      typeof entry.id !== "string" ||
      typeof entry.calendarId !== "string" ||
      typeof entry.title !== "string" ||
      typeof entry.description !== "string" ||
      typeof entry.allDay !== "boolean" ||
      typeof entry.start !== "string" ||
      typeof entry.end !== "string"
    ) {
      continue;
    }
    const start = new Date(entry.start);
    const end = new Date(entry.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      continue;
    }
    items.push({
      id: entry.id,
      calendarId: entry.calendarId,
      title: entry.title,
      description: entry.description,
      allDay: entry.allDay,
      // Pre-release cache rows carry no location; treat them as unset.
      location: typeof entry.location === "string" ? entry.location : "",
      start,
      end,
    });
  }
  return items;
}
