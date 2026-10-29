/**
 * Pure helpers for the durable pinned-events selection cache.
 *
 * The cache row stores raw `CalendarEvent`s (all departments, rolling 3-month
 * window, deduped by event group) instead of rendered titles, so settings /
 * user / event-type changes take effect without invalidating it. Kept free of
 * Next/db imports so the validator and TTL gate are unit-testable; the
 * DB-backed read/rebuild lives in `pinnedCache.ts`.
 */

import type { CalendarEvent } from "./queries";

/** How long a stored pinned selection is served without a background rebuild. */
export const PINNED_CACHE_FRESH_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isPinnedCalendarEvent(value: unknown): value is CalendarEvent {
  if (!isRecord(value)) {
    return false;
  }
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.start !== "string" ||
    typeof value.end !== "string" ||
    typeof value.color !== "string" ||
    !isRecord(value.payload)
  ) {
    return false;
  }
  const payload = value.payload;
  return (
    typeof payload.calendarId === "string" &&
    typeof payload.googleEventId === "string" &&
    typeof payload.allDay === "boolean" &&
    isNullableString(payload.eventType) &&
    typeof payload.calendarName === "string" &&
    isNullableString(payload.eventId) &&
    isNullableString(payload.creatorId) &&
    isStringArray(payload.inviteeUserIds) &&
    isStringArray(payload.inviteeDepartmentIds) &&
    isNullableString(payload.rawTitle) &&
    typeof payload.timeOption === "string" &&
    isNullableString(payload.startAmPm) &&
    isNullableString(payload.endAmPm) &&
    typeof payload.pinned === "boolean" &&
    typeof payload.location === "string"
  );
}

/** Whether a stored JSONB value is a usable pinned selection (`null` = rebuild). */
export function decodePinnedSelection(value: unknown): CalendarEvent[] | null {
  if (!Array.isArray(value) || !value.every(isPinnedCalendarEvent)) {
    return null;
  }
  return value;
}

/** Whether the stored selection is recent enough to serve without rebuilding. */
export function pinnedCacheIsFresh(
  fetchedAt: Date,
  now: Date,
  freshMs: number = PINNED_CACHE_FRESH_MS,
): boolean {
  return now.getTime() - fetchedAt.getTime() < freshMs;
}
