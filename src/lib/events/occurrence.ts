/**
 * Pure occurrence identity for recurring events.
 *
 * Google expands a recurring series into instances. Every instance carries its
 * parent's `recurringEventId` and the slot it would have occupied
 * (`originalStartTime`), while every department copy of that occurrence shares
 * the app's notes group id. The read path must therefore collapse **department
 * copies of one occurrence** but keep **different occurrences** distinct —
 * deduping by group id alone would render a whole series as one chip.
 *
 * Kept I/O-free so the dashboard, pinned selection, My Events, KAH and clash
 * inputs can share one definition.
 */

import { formatInstantToNaive, utcToDateString } from "./datetime";

/** The occurrence-relevant fields of a read-model event or Google item. */
export interface OccurrenceIdentityInput {
  eventId: string | null;
  calendarId: string;
  googleEventId: string;
  recurringEventId?: string | null;
  /** Normalised original slot: `YYYY-MM-DD` for all-day, naive SGT otherwise. */
  originalStartTime?: string | null;
  /** The event's actual (possibly moved) naive start. */
  start?: string | null;
}

/**
 * Normalise Google's `originalStartTime` for identity/display: an all-day slot
 * is its civil date; a timed slot is the UTC+8 naive wall clock. The same
 * occurrence in every department calendar yields the same string.
 */
export function normalizeOriginalStartTime(date: Date, allDay: boolean): string {
  return allDay ? utcToDateString(date) : formatInstantToNaive(date);
}

/**
 * The key one rendered occurrence is deduped by across department copies.
 * - one-off app events: the group id;
 * - recurring app instances: group id + original slot (or actual start);
 * - external/legacy copies: calendar + Google event id (they have no group id).
 */
export function occurrenceKey(input: OccurrenceIdentityInput): string {
  const base = input.eventId ?? `${input.calendarId}:${input.googleEventId}`;
  if (!input.recurringEventId && !input.originalStartTime) {
    return base;
  }
  return `${base}:${input.originalStartTime ?? input.start ?? input.googleEventId}`;
}

/** Whether a read-model payload/ref is an instance of a repeating series. */
export function isRecurringInstance(
  value:
    | {
        recurringEventId?: string | null;
      }
    | null
    | undefined,
): boolean {
  return typeof value?.recurringEventId === "string" && value.recurringEventId.length > 0;
}

/** Whether a read-model payload carries an app-managed recurrence rule. */
export function isAppRecurring(
  value:
    | {
        recurrence?: unknown;
        recurringEventId?: string | null;
      }
    | null
    | undefined,
): boolean {
  return Boolean(value && (value.recurrence || isRecurringInstance(value)));
}

/**
 * Keep one representative per occurrence: the first event seen wins. Department
 * copies of the same occurrence share a key; different occurrences do not.
 * Input order defines the representative, so callers feed it deterministically.
 */
export function dedupeEventsByOccurrence<
  T extends {
    payload: {
      eventId: string | null;
      calendarId: string;
      googleEventId: string;
      recurringEventId?: string | null;
      originalStartTime?: string | null;
    };
    start?: string;
  },
>(events: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const event of events) {
    const key = occurrenceKey({ ...event.payload, start: event.start ?? null });
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(event);
  }
  return out;
}

/**
 * Collapse every occurrence of one logical series to its earliest event (by
 * naive start). Used by Pinned Events and My Events, whose lists are
 * series-level rather than occurrence-level. Ungrouped events always pass.
 */
export function collapseSeriesEvents<
  T extends {
    payload: {
      eventId: string | null;
      recurringEventId?: string | null;
    };
    start: string;
  },
>(events: readonly T[]): T[] {
  const earliest = new Map<string, T>();
  const ungrouped: T[] = [];
  for (const event of events) {
    if (!event.payload.eventId) {
      ungrouped.push(event);
      continue;
    }
    const current = earliest.get(event.payload.eventId);
    if (!current || event.start < current.start) {
      earliest.set(event.payload.eventId, event);
    }
  }
  return [...ungrouped, ...earliest.values()].sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Find the occurrence a deep link targets: the group's occurrence whose start
 * day matches the link's `date` when provided, else the earliest occurrence.
 */
export function findEventByOccurrence<
  T extends {
    payload: { eventId: string | null };
    start: string;
  },
>(events: readonly T[], eventId: string | null | undefined, date?: string | null): T | null {
  if (!eventId) {
    return null;
  }
  const matches = events.filter((event) => event.payload.eventId === eventId);
  if (matches.length === 0) {
    return null;
  }
  const anchor = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  if (anchor) {
    const exact = matches.find((event) => event.start.slice(0, 10) === anchor);
    if (exact) {
      return exact;
    }
  }
  return matches.reduce((earliest, event) => (event.start < earliest.start ? event : earliest));
}
