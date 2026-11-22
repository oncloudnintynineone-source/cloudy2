/**
 * Pure helpers for shaping the My Events list (docs/event-history.md). The list
 * is a union of live events the user organized (read from the calendars) and
 * deleted ones (from audit rows); these helpers format and order those rows
 * without touching the database, so they are unit-testable in isolation.
 */

import { subOneDay } from "./datetime";
import type { ChangeTrailItem } from "./changeTrail";
import { eventNameMatchesText } from "@/lib/events/textFilter";
import type { MantineColor } from "@mantine/core";

/** One row in the My Events list, from either the live or the audit source. */
export interface MyEventRow {
  /** Stable list key (group id when present, else the copy id). */
  key: string;
  /** Logical event group id — the per-event history route key (null = legacy). */
  eventId: string | null;
  /** Department calendar the live copy sits on (`_eventCal` deep-link hint); null for audit-only/deleted rows. */
  calendarId: string | null;
  /** Rendered title. */
  title: string;
  /** Human-readable time label (`21 Aug · 14:00 – 15:30` style). */
  time: string;
  /** Naive sort key (`YYYY-MM-DD HH:mm`) — the event's start. */
  sortKey: string;
  /** Naive last-edit key (`YYYY-MM-DD HH:mm`), or null when the event has no audit rows. */
  editKey: string | null;
  /** Department names the event is tagged on. */
  departments: string[];
  /** True when a later delete row exists for this event. */
  deleted: boolean;
  /** Row accent color: event-type color, else the department fallback. */
  color: MantineColor;
  /** Inline change timeline (newest first); empty when no audit rows remain. */
  trail: ChangeTrailItem[];
  /** Human repeat summary when this row represents a repeating series. */
  repeats?: string | null;
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

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Humanize an ISO-ish time label (from {@link formatMyEventTime} or an audit
 * snapshot): every `YYYY-MM-DD` becomes `D Mon`, dropping the year when it
 * matches `todayYear`, and a same-month date span collapses (`21 Aug – 23 Aug`
 * → `21 – 23 Aug`). Clocks, dashes, and `(AM)`/`(PM)` markers pass through.
 */
export function humanizeMyEventTime(time: string, todayYear: string): string {
  const replaced = time.replace(
    /(\d{4})-(\d{2})-(\d{2})/g,
    (_, year, month, day) => {
      const label = `${Number(day)} ${MONTH_ABBREVIATIONS[Number(month) - 1]}`;
      return year === todayYear ? label : `${label} ${year}`;
    },
  );
  return replaced.replace(
    /(\d+) ([A-Z][a-z]{2})( \d{4})? \u2013 (\d+) ([A-Z][a-z]{2})( \d{4})?/g,
    (match, d1, mon1, year1, d2, mon2, year2) =>
      mon1 === mon2 && (year1 ?? "") === (year2 ?? "")
        ? `${d1} \u2013 ${d2} ${mon1}${year1 ?? ""}`
        : match,
  );
}

/**
 * Merge the live (active) and audit (deleted) rows into one list ordered by
 * last edit (newest first), dropping a deleted row when the same logical event
 * is still live. Rows without an audit-backed `editKey` fall back to their
 * start (`sortKey`); ties break on start (newest first), then key.
 */
export function mergeMyEvents(active: MyEventRow[], deleted: MyEventRow[]): MyEventRow[] {
  const liveIds = new Set(active.map((row) => row.eventId).filter((id): id is string => id !== null));
  const deletedOnly = deleted.filter((row) => row.eventId === null || !liveIds.has(row.eventId));
  return [...active, ...deletedOnly].sort(
    (a, b) =>
      (b.editKey ?? b.sortKey).localeCompare(a.editKey ?? a.sortKey) ||
      b.sortKey.localeCompare(a.sortKey) ||
      a.key.localeCompare(b.key),
  );
}

/**
 * Narrow My Events rows by title (docs/ui-ux-improvements.md C4): the same
 * case-insensitive substring semantics as the dashboard's event-name filter
 * (`textFilter.ts`), so the vocabulary is identical across surfaces. Rows
 * carry only the rendered title (audit-shaped rows never saw the raw typed
 * name), so that is the searched field. A blank query returns the input
 * unchanged.
 */
export function filterMyEventRowsByTitle(
  rows: readonly MyEventRow[],
  query: string | null | undefined,
): MyEventRow[] {
  const q = (query ?? "").trim();
  if (q === "") {
    return [...rows];
  }
  return rows.filter((row) => eventNameMatchesText(null, row.title, q));
}
