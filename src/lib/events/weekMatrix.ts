/**
 * Pure helpers for the Week v2 matrix view: 7 day columns (the week's days) x
 * one row per user/department. Events are binned into (row, day) cells so the
 * grid can render a chip in every row and day an event applies to. Row
 * semantics match the schedule views exactly. Kept free of I/O for unit
 * testing.
 */

import { subOneDay } from "./datetime";
import { departmentRowId, rowsForEvent } from "./schedule";
import type { CalendarEvent } from "./queries";

/** Row -> day -> the events occupying that cell, in insertion order. */
export type WeekMatrix = Map<string, Map<string, CalendarEvent[]>>;

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
 * Bin the week's events into (row, day) cells, sorted per cell by start time
 * (ties by title). Rows follow the schedule views: the creator (when known)
 * plus every tagged user and tagged department. Events with no row still
 * appear when they are external (pinned to their own calendar's department
 * row). A multi-day event appears in every covered day.
 */
export function buildWeekMatrix(events: CalendarEvent[], week: string[]): WeekMatrix {
  const matrix: WeekMatrix = new Map();
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
    for (const rowId of rows) {
      let byDay = matrix.get(rowId);
      if (!byDay) {
        byDay = new Map();
        matrix.set(rowId, byDay);
      }
      for (const day of days) {
        let cell = byDay.get(day);
        if (!cell) {
          cell = [];
          byDay.set(day, cell);
        }
        cell.push(event);
      }
    }
  }
  for (const byDay of matrix.values()) {
    for (const cell of byDay.values()) {
      cell.sort((a, b) =>
        a.start !== b.start ? (a.start < b.start ? -1 : 1) : a.title.localeCompare(b.title),
      );
    }
  }
  return matrix;
}
