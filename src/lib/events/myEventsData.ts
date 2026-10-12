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

import { deletedEventIds, listMyCreatedEvents } from "@/lib/audit/queries";
import { formatInstantToNaive, monthsInRange } from "@/lib/events/datetime";
import { createdEventSummary } from "@/lib/events/history";
import {
  auditTimeSortKey,
  formatMyEventTime,
  mergeMyEvents,
  type MyEventRow,
} from "@/lib/events/myEvents";
import { myEventsWindow, type MyEventsRangeMonths } from "@/lib/events/myEventsRange";
import { fetchRangeEvents, listCalendars } from "@/lib/events/queries";

export interface MyEventsData {
  rangeMonths: MyEventsRangeMonths;
  /** First day of the window (`YYYY-MM-DD`). */
  windowStart: string;
  /** Last day of the window (`YYYY-MM-DD`). */
  windowEnd: string;
  /** Combined live + deleted rows, newest first. */
  rows: MyEventRow[];
}

export async function buildMyEventsData(params: {
  userId: string;
  rangeMonths: MyEventsRangeMonths;
}): Promise<MyEventsData> {
  const today = formatInstantToNaive(new Date()).slice(0, 10);
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
    }),
    listMyCreatedEvents(params.userId),
  ]);

  const active: MyEventRow[] = [];
  const liveIds = new Set<string>();
  for (const event of live) {
    const payload = event.payload;
    if (payload.creatorId !== params.userId) {
      continue;
    }
    if (payload.eventId) {
      liveIds.add(payload.eventId);
    }
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
      time: formatMyEventTime(payload.allDay, event.start, event.end),
      sortKey: event.start.slice(0, 16),
      departments: departmentNames,
      deleted: false,
    });
  }

  const summaries = auditCreates.flatMap((row) => {
    const summary = createdEventSummary(row.details);
    return summary === null ? [] : [summary];
  });
  const deletedIds = await deletedEventIds([...new Set(summaries.map((summary) => summary.eventId))]);

  const deleted: MyEventRow[] = [];
  for (const summary of summaries) {
    if (!deletedIds.has(summary.eventId) || liveIds.has(summary.eventId)) {
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
      time: summary.time,
      sortKey: auditTimeSortKey(summary.time),
      departments: summary.departments,
      deleted: true,
    });
  }

  return {
    rangeMonths: params.rangeMonths,
    windowStart,
    windowEnd,
    rows: mergeMyEvents(active, deleted),
  };
}
