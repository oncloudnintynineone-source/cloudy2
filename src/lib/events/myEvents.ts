/**
 * Pure helpers for shaping the My Events list (docs/event-history.md). The list
 * is a union of live events the user organized (read from the calendars) and
 * deleted ones (from audit rows); these helpers format and order those rows
 * without touching the database, so they are unit-testable in isolation.
 */

import { subOneDay } from "./datetime";

/** One row in the My Events list, from either the live or the audit source. */
export interface MyEventRow {
  /** Stable list key (group id when present, else the copy id). */
  key: string;
  /** Logical event group id — the per-event history route key (null = legacy). */
  eventId: string | null;
  /** Rendered title. */
  title: string;
  /** Human-readable time string. */
  time: string;
  /** Naive sort key (`YYYY-MM-DD HH:mm`) — the event's start. */
  sortKey: string;
  /** Department names the event is tagged on. */
  departments: string[];
  /** True when a later delete row exists for this event. */
  deleted: boolean;
}

/**
 * Format a live event's window as one string. All-day events use the inclusive
 * last day (Google's all-day end is exclusive); timed events join the clocks,
 * spanning days when needed.
 */
export function formatMyEventTime(allDay: boolean, start: string, end: string): string {
  const startDate = start.slice(0, 10);
  if (allDay) {
    const endDate = end ? subOneDay(end.slice(0, 10)) : startDate;
    return endDate === startDate ? startDate : `${startDate} \u2013 ${endDate}`;
  }
  const startClock = start.slice(11, 16);
  if (!end) {
    return `${startDate} ${startClock}`;
  }
  const endDate = end.slice(0, 10);
  const endClock = end.slice(11, 16);
  return endDate === startDate
    ? `${startDate} ${startClock} \u2013 ${endClock}`
    : `${startDate} ${startClock} \u2013 ${endDate} ${endClock}`;
}

/**
 * A sortable `YYYY-MM-DD HH:mm` key from an audit snapshot's pre-formatted
 * `time` (which always starts with the start date, followed by either a clock
 * or an `(AM)`/`(PM)` marker). Non-clock markers sort as midnight.
 */
export function auditTimeSortKey(time: string): string {
  const date = time.slice(0, 10);
  const clock = time.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(clock) ? `${date} ${clock}` : `${date} 00:00`;
}

/**
 * Merge the live (active) and audit (deleted) rows into one newest-first list,
 * dropping a deleted row when the same logical event is still live.
 */
export function mergeMyEvents(active: MyEventRow[], deleted: MyEventRow[]): MyEventRow[] {
  const liveIds = new Set(active.map((row) => row.eventId).filter((id): id is string => id !== null));
  const deletedOnly = deleted.filter((row) => row.eventId === null || !liveIds.has(row.eventId));
  return [...active, ...deletedOnly].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}
