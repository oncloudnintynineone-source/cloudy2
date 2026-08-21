/**
 * Pure helpers for the Week v2 matrix view: 7 day columns (the week's days) x
 * one row per user/department. Events are laid out as spanning banners that
 * occupy every day they cover within a row, placed in "lanes" (stacked
 * vertically within the row) so overlapping multi-day events don't collide.
 * Row semantics match the schedule views exactly. Kept free of I/O for unit
 * testing.
 */

import { subOneDay } from "./datetime";
import { departmentRowId, rowsForEvent } from "./schedule";
import type { CalendarEvent } from "./queries";

/** A single event placed in the matrix with its day range. */
export interface WeekSpan {
  event: CalendarEvent;
  /** Inclusive index into `week` of the first covered day. */
  startDay: number;
  /** Inclusive index into `week` of the last covered day. */
  endDay: number;
}

/**
 * A lane is a non-overlapping sequence of spans within a row, drawn
 * top-to-bottom.  Lane `n` renders on grid row `n + 1`.
 */
export type WeekLane = WeekSpan[];

/**
 * Row id → lanes (in draw order).  Lane `n` renders on grid row `n + 1`
 * of the resource row's nested grid.
 */
export type WeekLanes = Map<string, WeekLane[]>;

/**
 * The `week` days an event's naive start/end range occupies, in week order.
 * All-day events carry an *exclusive* end date (the day after the last day),
 * so the final day is the end date minus one.
 */
export function coveredDays(event: CalendarEvent, week: string[]): string[] {
  const lastDay = event.payload.allDay ? subOneDay(event.end.slice(0, 10)) : event.end.slice(0, 10);
  const firstDay = event.start.slice(0, 10);
  return week.filter((day) => day >= firstDay && day <= lastDay);
}

/**
 * Build the lane-based matrix for the week's events.  Returns a map keyed by
 * row id (user id or `dept:<calendarId>`).  Each row maps to an array of
 * non-overlapping lanes.  Lane `n` renders on grid row `n + 1`.
 *
 * Events with no row still appear when they are external (pinned to their
 * calendar's department row).  Unlinked non-external events are dropped.
 * A multi-day event produces a single `WeekSpan` that spans its covered
 * columns; single-day events also produce a one-column span.
 */
export function buildWeekLanes(events: CalendarEvent[], week: string[]): WeekLanes {
  // Phase 1: collect one WeekSpan per event per row.
  const spansByRow = new Map<string, WeekSpan[]>();

  for (const event of events) {
    const rows = rowsForEvent({
      creatorId: event.payload.creatorId,
      userIds: event.payload.inviteeUserIds,
      departmentIds: event.payload.inviteeDepartmentIds,
    });
    if (rows.length === 0 && event.payload.external) {
      rows.push(departmentRowId(event.payload.calendarId));
    }
    if (rows.length === 0) {
      continue;
    }
    const days = coveredDays(event, week);
    if (days.length === 0) {
      continue;
    }
    const startDay = week.indexOf(days[0]);
    const endDay = week.indexOf(days[days.length - 1]);
    const span: WeekSpan = { event, startDay, endDay };

    for (const rowId of rows) {
      let rowSpans = spansByRow.get(rowId);
      if (!rowSpans) {
        rowSpans = [];
        spansByRow.set(rowId, rowSpans);
      }
      rowSpans.push(span);
    }
  }

  // Phase 2: for each row sort spans by startDay → start time → title, then
  // merge into lanes via greedy interval partitioning.
  const lanes: WeekLanes = new Map();
  for (const [rowId, rowSpans] of spansByRow) {
    rowSpans.sort(
      (a, b) =>
        a.startDay !== b.startDay
          ? a.startDay - b.startDay
          : a.event.start !== b.event.start
            ? a.event.start < b.event.start
              ? -1
              : 1
            : a.event.title.localeCompare(b.event.title),
    );

    const merged: WeekLane[] = [];
    for (const span of rowSpans) {
      // Find the first lane whose last span ends before this span starts.
      let placed = false;
      for (const lane of merged) {
        if (lane[lane.length - 1].endDay < span.startDay) {
          lane.push(span);
          placed = true;
          break;
        }
      }
      if (!placed) {
        merged.push([span]);
      }
    }
    lanes.set(rowId, merged);
  }

  return lanes;
}
