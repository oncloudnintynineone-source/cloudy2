/**
 * Server-side builder for the My Events page (docs/event-history.md). The list
 * is a union of two sources:
 *
 * - **Live** events the signed-in user organized, read from every department
 *   calendar over the selected window (the organizer is stored on the event, so
 *   this catches events created "on behalf of" and events older than audit
 *   retention).
 * - **Deleted** events, from the user's own `event.create` audit rows that have
 *   a paired `event.delete` row (audit-bounded, so only within retention).
 *
 * The combined list is shaped, sorted, and returned whole; the page slices it
 * for pagination (the set is bounded by the window + retention, so no SQL union
 * is needed).
 */

import { latestDeleteTimes, latestEventEditTimes, listMyCreatedEvents } from "@/lib/audit/queries";
import { formatInstantToNaive, monthsInRange } from "@/lib/events/datetime";
import { createdEventSummary } from "@/lib/events/history";
import {
  auditTimeSortKey,
  formatMyEventTime,
  humanizeMyEventTime,
  mergeMyEvents,
  type MyEventRow,
} from "@/lib/events/myEvents";
import { myEventsWindow, type MyEventsRangeMonths } from "@/lib/events/myEventsRange";
import { fetchRangeEvents, listCalendars } from "@/lib/events/queries";
import { DEFAULT_MONTH_FRESHNESS, type MonthCacheFreshness } from "@/lib/google/eventsCache";
import { perf } from "@/lib/perf";

/**
 * Months strictly before the current month are near-immutable: their cached
 * rows serve for 24 h without a blocking Google fetch or a background refresh.
 * In-app mutations still delete the row (and the L1-vs-L2 metadata check turns
 * that into a blocking refetch), so read-your-writes is unaffected — only
 * external Google edits to past months converge slower. This is what stops a
 * wide My Events window from paying (calendars × whole-window) blocking
 * `events.list` calls on every visit (docs/event-history.md §1.4.2).
 */
const PAST_MONTH_FRESHNESS: MonthCacheFreshness = {
  freshMs: 24 * 60 * 60_000,
  expireMs: 24 * 60 * 60_000,
};

function myEventsFreshnessFor(currentMonth: string): (month: string) => MonthCacheFreshness {
  return (month) => (month < currentMonth ? PAST_MONTH_FRESHNESS : DEFAULT_MONTH_FRESHNESS);
}

export interface MyEventsData {
  rangeMonths: MyEventsRangeMonths;
  /** First day of the window (`YYYY-MM-DD`). */
  windowStart: string;
  /** Last day of the window (`YYYY-MM-DD`). */
  windowEnd: string;
  /** Combined live + deleted rows, last-edit first (start-date fallback). */
  rows: MyEventRow[];
}

/** Naive `YYYY-MM-DD HH:mm` last-edit key (UTC+8 wall clock), null when unknown. */
function lastEditKey(time: Date | undefined): string | null {
  return time ? formatInstantToNaive(time).slice(0, 16) : null;
}

export async function buildMyEventsData(params: {
  userId: string;
  rangeMonths: MyEventsRangeMonths;
}): Promise<MyEventsData> {
  const done = perf(`buildMyEventsData ±${params.rangeMonths}`);
  const today = formatInstantToNaive(new Date()).slice(0, 10);
  const todayYear = today.slice(0, 4);
  const { windowStart, windowEnd } = myEventsWindow(today, params.rangeMonths);
  const months = monthsInRange(windowStart, windowEnd);

  const calendars = await listCalendars();
  const calendarNameById = new Map(calendars.map((calendar) => [calendar.id, calendar.name]));

  const [live, auditCreates] = await Promise.all([
    fetchRangeEvents({
      months,
      calendarIds: calendars.map((calendar) => calendar.id),
      typeFilter: [],
      userFilter: [],
      // The organizer filter runs inside the projection, so non-matching
      // events never build a payload (the window spans every calendar).
      creatorFilter: params.userId,
      // Past months are near-immutable — serve them cached for 24 h.
      freshnessFor: myEventsFreshnessFor(today.slice(0, 7)),
    }),
    listMyCreatedEvents(params.userId),
  ]);
  const doneAudit = perf("  myEvents audit reads");

  const myLive = live;
  const liveIds = new Set(
    myLive.map((event) => event.payload.eventId).filter((id): id is string => id !== null),
  );
  const summaries = auditCreates.flatMap((row) => {
    const summary = createdEventSummary(row.details);
    return summary === null ? [] : [summary];
  });

  const [editTimes, deleteTimes] = await Promise.all([
    latestEventEditTimes([...liveIds]),
    latestDeleteTimes([...new Set(summaries.map((summary) => summary.eventId))]),
  ]);
  doneAudit(`live=${myLive.length} creates=${auditCreates.length}`);

  const active: MyEventRow[] = [];
  for (const event of myLive) {
    const payload = event.payload;
    const departmentNames = [
      ...new Set(
        payload.inviteeDepartmentIds
          .map((id) => calendarNameById.get(id))
          .filter((name): name is string => Boolean(name)),
      ),
    ];
    active.push({
      key: payload.eventId ?? event.id,
      eventId: payload.eventId,
      title: event.title,
      time: humanizeMyEventTime(
        formatMyEventTime(payload.allDay, event.start, event.end),
        todayYear,
      ),
      sortKey: payload.allDay ? `${event.start.slice(0, 10)} 00:00` : event.start.slice(0, 16),
      editKey: lastEditKey(payload.eventId ? editTimes.get(payload.eventId) : undefined),
      departments: departmentNames,
      deleted: false,
      color: event.color,
      trail: [],
    });
  }

  const deleted: MyEventRow[] = [];
  for (const summary of summaries) {
    const deleteTime = deleteTimes.get(summary.eventId);
    if (!deleteTime || liveIds.has(summary.eventId)) {
      continue;
    }
    const startDate = summary.time.slice(0, 10);
    if (startDate < windowStart || startDate > windowEnd) {
      continue;
    }
    deleted.push({
      key: summary.eventId,
      eventId: summary.eventId,
      title: summary.title ?? "Untitled event",
      time: humanizeMyEventTime(summary.time, todayYear),
      sortKey: auditTimeSortKey(summary.time),
      editKey: lastEditKey(deleteTime),
      departments: summary.departments,
      deleted: true,
      color: "gray",
      trail: [],
    });
  }

  const rows = mergeMyEvents(active, deleted);
  done(`${rows.length} rows`);
  return {
    rangeMonths: params.rangeMonths,
    windowStart,
    windowEnd,
    rows,
  };
}
