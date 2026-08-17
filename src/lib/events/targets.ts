/**
 * Pure helpers for cross-department event copies. A logical event lives in one
 * calendar per involved department (the creator's home department plus each
 * tagged user's department and tagged departments); all copies share one
 * `eventId` in their notes so the app can treat them as a single event. These
 * helpers compute the target set, the reconcile plan, and display dedup — kept
 * free of I/O for unit testing.
 */

import type { CalendarEvent } from "./queries";

/** Reference to one (representative) copy of a logical event, for edit/delete. */
export interface EventRef {
  /** Registry department id of the copy the client saw. */
  calendarId: string;
  googleEventId: string;
  /** Shared group id, null for legacy single-copy events. */
  eventId: string | null;
  /** Naive `YYYY-MM-DD HH:mm:ss` times of the copy. */
  start: string;
  end: string;
  allDay: boolean;
  creatorId: string | null;
  inviteeUserIds: string[];
  inviteeDepartmentIds: string[];
}

/**
 * Department calendars a logical event must exist in: the creator's department
 * plus each tagged user's department and each tagged department, deduped.
 * Nulls (people without a department) contribute nothing.
 */
export function deriveTargetCalendarIds(params: {
  creatorDepartmentId: string | null;
  invitedUserDepartmentIds: (string | null)[];
  invitedDepartmentIds: string[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | null | undefined) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  add(params.creatorDepartmentId);
  for (const id of params.invitedUserDepartmentIds) {
    add(id);
  }
  for (const id of params.invitedDepartmentIds) {
    add(id);
  }
  return out;
}

/** Which target calendars gain, keep, or lose a copy after an edit. */
export function diffEventTargets(
  oldTargets: string[],
  newTargets: string[],
): { create: string[]; keep: string[]; remove: string[] } {
  const oldSet = new Set(oldTargets);
  const newSet = new Set(newTargets);
  return {
    create: newTargets.filter((id) => !oldSet.has(id)),
    keep: newTargets.filter((id) => oldSet.has(id)),
    remove: oldTargets.filter((id) => !newSet.has(id)),
  };
}

/**
 * Keep one representative copy per logical event: the first event seen for a
 * non-null group id wins, events without a group id (legacy) always pass.
 * Input order defines the representative — callers must feed it deterministically.
 */
export function dedupeEventsByGroupId<T extends { payload: { eventId: string | null } }>(
  events: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const event of events) {
    const eventId = event.payload.eventId;
    if (eventId) {
      if (seen.has(eventId)) {
        continue;
      }
      seen.add(eventId);
    }
    out.push(event);
  }
  return out;
}

/** Build the edit/delete reference from a schedule-ready event. */
export function eventRefFromCalendarEvent(event: CalendarEvent): EventRef {
  return {
    calendarId: event.payload.calendarId,
    googleEventId: event.payload.googleEventId,
    eventId: event.payload.eventId,
    start: event.start,
    end: event.end,
    allDay: event.payload.allDay,
    creatorId: event.payload.creatorId,
    inviteeUserIds: event.payload.inviteeUserIds,
    inviteeDepartmentIds: event.payload.inviteeDepartmentIds,
  };
}
