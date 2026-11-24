import { brotliCompressSync, brotliDecompressSync, constants as zlibConstants } from "node:zlib";

import type { GcalEventItem } from "./types";

/**
 * Pure helpers for the Google Calendar events cache. Kept free of Next/db
 * imports so they are unit-testable; the DB-backed cache read/write lives in
 * `src/lib/google/eventsCache.ts`.
 *
 * The month payload is brotli-compressed and base64url-encoded so a modest
 * calendar-month ships a fraction of the bytes raw JSONB did — Neon bills that
 * egress (docs/neon-usage.md). `node:zlib` is the only dependency, which is why
 * this module stays server-only (it is imported by the cache layer and tests
 * only).
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

/** Marker prefix on every compressed payload; bump it when the shape changes. */
const PAYLOAD_PREFIX = "br1:";

/** Brotli quality for cache payloads — a fast, high-ratio setting for JSON. */
const BROTLI_QUALITY = 5;

/** The legacy (jsonb) stored shape, kept for the transition read fallback. */
interface CachedEvent {
  id: string;
  calendarId: string;
  title: string;
  description: string;
  allDay: boolean;
  location: string;
  start: string;
  end: string;
  recurringEventId?: string | null;
  originalStartTime?: string | null;
  recurrence?: string[] | null;
  status?: string | null;
}

/**
 * The compressed-payload event shape. `calendarId` is omitted — it is the row
 * key of the cache entry — and empty/absent optional fields are dropped so
 * they cost no bytes (the decoder defaults them).
 */
interface SlimCachedEvent {
  id: string;
  start: string;
  end: string;
  allDay: boolean;
  title?: string;
  description?: string;
  location?: string;
  recurringEventId?: string;
  originalStartTime?: string;
  recurrence?: string[];
  status?: string;
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
    recurringEventId: item.recurringEventId ?? null,
    originalStartTime: item.originalStartTime?.toISOString() ?? null,
    recurrence: item.recurrence ?? null,
    status: item.status ?? null,
  }));
}

/** Decode legacy stored cache entries back into `GcalEventItem`s; malformed rows are dropped. */
export function decodeCachedEvents(raw: unknown): GcalEventItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return decodeEventList(raw, null);
}

/**
 * Encode one calendar-month for the cache: compressed, base64url text with the
 * format tag inline. `calendarId` is dropped (it is the row key) and empty
 * optional fields are omitted; the decoder restores both.
 */
export function encodeCachedMonth(items: GcalEventItem[]): string {
  return encodeCompressedPayload(items.map(toSlimEvent));
}

/**
 * Decode one calendar-month payload. `null` means "not usable" (unknown tag,
 * corrupt brotli, malformed JSON, or a non-array body) so the caller can treat
 * the entry as a miss and refresh it; individual malformed events are dropped.
 */
export function decodeCachedMonth(
  payload: string | null | undefined,
  calendarGoogleId: string,
): GcalEventItem[] | null {
  const raw = decodeCompressedPayload(payload);
  if (!Array.isArray(raw)) {
    return null;
  }
  return decodeEventList(raw, calendarGoogleId);
}

/** Brotli-compress any JSON-serializable value into a tagged base64url string. */
export function encodeCompressedPayload(value: unknown): string {
  const json = JSON.stringify(value);
  const compressed = brotliCompressSync(Buffer.from(json, "utf8"), {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: json.length,
    },
  });
  return PAYLOAD_PREFIX + compressed.toString("base64url");
}

/** Decode a payload written by {@link encodeCompressedPayload}; null when unusable. */
export function decodeCompressedPayload(payload: string | null | undefined): unknown | null {
  if (typeof payload !== "string" || !payload.startsWith(PAYLOAD_PREFIX)) {
    return null;
  }
  try {
    const compressed = Buffer.from(payload.slice(PAYLOAD_PREFIX.length), "base64url");
    return JSON.parse(brotliDecompressSync(compressed).toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function toSlimEvent(item: GcalEventItem): SlimCachedEvent {
  const slim: SlimCachedEvent = {
    id: item.id,
    start: item.start.toISOString(),
    end: item.end.toISOString(),
    allDay: item.allDay,
  };
  if (item.title) {
    slim.title = item.title;
  }
  if (item.description) {
    slim.description = item.description;
  }
  if (item.location) {
    slim.location = item.location;
  }
  if (item.recurringEventId) {
    slim.recurringEventId = item.recurringEventId;
  }
  if (item.originalStartTime) {
    slim.originalStartTime = item.originalStartTime.toISOString();
  }
  if (item.recurrence && item.recurrence.length > 0) {
    slim.recurrence = item.recurrence;
  }
  if (item.status) {
    slim.status = item.status;
  }
  return slim;
}

/**
 * Decode a list of stored event values. `calendarId` is supplied for compressed
 * payloads (the row key) and read from the entry for legacy jsonb rows.
 */
function decodeEventList(raw: unknown[], calendarId: string | null): GcalEventItem[] {
  const items: GcalEventItem[] = [];
  for (const value of raw) {
    const item = decodeEventValue(value, calendarId);
    if (item) {
      items.push(item);
    }
  }
  return items;
}

/** Decode one stored event value, or null when it is not a usable event. */
function decodeEventValue(value: unknown, calendarId: string | null): GcalEventItem | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const entry = value as Record<string, unknown>;
  const resolvedCalendarId =
    calendarId ?? (typeof entry.calendarId === "string" ? entry.calendarId : null);
  if (resolvedCalendarId === null) {
    return null;
  }
  if (typeof entry.id !== "string") {
    return null;
  }
  if (typeof entry.start !== "string" || typeof entry.end !== "string") {
    return null;
  }
  const start = new Date(entry.start);
  const end = new Date(entry.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  const originalStartTime =
    typeof entry.originalStartTime === "string" ? new Date(entry.originalStartTime) : null;
  return {
    id: entry.id,
    calendarId: resolvedCalendarId,
    title: typeof entry.title === "string" ? entry.title : "",
    description: typeof entry.description === "string" ? entry.description : "",
    allDay: entry.allDay === true,
    // Pre-release cache rows carry no location; treat them as unset.
    location: typeof entry.location === "string" ? entry.location : "",
    start,
    end,
    recurringEventId: typeof entry.recurringEventId === "string" ? entry.recurringEventId : null,
    originalStartTime:
      originalStartTime && !Number.isNaN(originalStartTime.getTime()) ? originalStartTime : null,
    recurrence: Array.isArray(entry.recurrence)
      ? entry.recurrence.filter((line): line is string => typeof line === "string")
      : null,
    status: typeof entry.status === "string" ? entry.status : null,
  };
}
