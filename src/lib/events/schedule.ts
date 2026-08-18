/**
 * Pure helpers for the Schedule (ResourcesDayView) view. They map calendar
 * events onto resource rows — one row per tagged department and one row per
 * user (creator + tagged people) — so the view can render an event in every
 * row it applies to. Kept free of I/O for unit testing.
 */

import type { CalendarEvent } from "./queries";

export interface ScheduleDepartment {
  id: string;
  name: string;
}

export interface ScheduleUser {
  id: string;
  name: string;
  shortname: string | null;
  departmentId: string | null;
}

export interface ScheduleResource {
  id: string;
  /** Display label: department name, or the user's shortname (name when unset). */
  label: string;
  /** Full display name for tooltips/aria: department or user full name. */
  fullName: string;
  isDepartment: boolean;
}

export interface ScheduleResourceGroup {
  label: string;
  resourceIds: string[];
}

export interface ScheduleResources {
  resources: ScheduleResource[];
  groups: ScheduleResourceGroup[] | undefined;
}

export interface ScheduleEvent extends CalendarEvent {
  resourceId: string;
}

const DEPT_ROW_PREFIX = "dept:";

/** Resource id of the row holding a department's tagged events. */
export function departmentRowId(calendarId: string): string {
  return `${DEPT_ROW_PREFIX}${calendarId}`;
}

export function isDepartmentRowId(id: string | number): boolean {
  return String(id).startsWith(DEPT_ROW_PREFIX);
}

/**
 * Row keys an event must appear in: the creator's row (when known) plus every
 * tagged user and tagged department, deduped.
 */
export function rowsForEvent(people: {
  creatorId: string | null;
  userIds: string[];
  departmentIds: string[];
}): string[] {
  const rows = new Set<string>();
  if (people.creatorId) {
    rows.add(people.creatorId);
  }
  for (const userId of people.userIds) {
    rows.add(userId);
  }
  for (const departmentId of people.departmentIds) {
    rows.add(departmentRowId(departmentId));
  }
  return [...rows];
}

/**
 * Expand events into one schedule event per row they apply to. `id` suffixed
 * with the row key keeps ids unique across rows of the same Google event.
 * Events linked to no one expand to nothing — except externally created ones,
 * which are pinned to their own calendar's department row so they stay visible.
 */
export function expandScheduleEvents(events: CalendarEvent[]): ScheduleEvent[] {
  const out: ScheduleEvent[] = [];
  for (const event of events) {
    const rows = rowsForEvent({
      creatorId: event.payload.creatorId,
      userIds: event.payload.inviteeUserIds,
      departmentIds: event.payload.inviteeDepartmentIds,
    });
    if (rows.length === 0 && event.payload.external) {
      rows.push(departmentRowId(event.payload.calendarId));
    }
    for (const rowId of rows) {
      out.push({ ...event, id: `${event.id}::${rowId}`, resourceId: rowId });
    }
  }
  return out;
}

/**
 * Build the resource rows for the schedule view: per selected department, a
 * department row (top) followed by that department's users (by name). User
 * row labels are the shortname (acronym), falling back to the full name when
 * the shortname is unset (matching the event title acronym token). A
 * department with no users still gets a row when an event tags it. Group
 * labels are only emitted when more than one department is shown.
 */
export function buildScheduleResources(params: {
  departments: ScheduleDepartment[];
  users: ScheduleUser[];
  events: CalendarEvent[];
}): ScheduleResources {
  const { departments, users, events } = params;
  const taggedDepts = new Set<string>();
  for (const event of events) {
    for (const departmentId of event.payload.inviteeDepartmentIds) {
      taggedDepts.add(departmentId);
    }
    // An external event's own calendar counts as tagged, so its department row
    // exists even when that department has no users.
    if (event.payload.external) {
      taggedDepts.add(event.payload.calendarId);
    }
  }

  const resources: ScheduleResource[] = [];
  const groups: ScheduleResourceGroup[] = [];
  let departmentCount = 0;

  const sortedDepts = [...departments].sort((a, b) => a.name.localeCompare(b.name));
  for (const dept of sortedDepts) {
    const deptUsers = users
      .filter((user) => user.departmentId === dept.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (deptUsers.length === 0 && !taggedDepts.has(dept.id)) {
      continue;
    }
    departmentCount += 1;
    const rowId = departmentRowId(dept.id);
    resources.push({ id: rowId, label: dept.name, fullName: dept.name, isDepartment: true });
    for (const user of deptUsers) {
      resources.push({
        id: user.id,
        label: user.shortname || user.name,
        fullName: user.name,
        isDepartment: false,
      });
    }
    groups.push({ label: dept.name, resourceIds: [rowId, ...deptUsers.map((user) => user.id)] });
  }

  return { resources, groups: departmentCount > 1 ? groups : undefined };
}
