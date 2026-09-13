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
  /** Organizer-only modification lock (admins bypass); authorization reads it. */
  ownerOnlyEdits: boolean;
}

/** Order-preserving dedupe of non-null department ids. */
function addUnique(out: string[], seen: Set<string>, id: string | null | undefined): void {
  if (id && !seen.has(id)) {
    seen.add(id);
    out.push(id);
  }
}

/**
 * Department calendars a logical event must exist in: each tagged user's
 * department and each tagged department, deduped. The organizer's home
 * department is NOT a target by itself — owning an event does not involve a
 * department. It is included only when the organizer is a participant (their id
 * is then among the invited users, so their department is already in
 * `invitedUserDepartmentIds`; this also covers invitee-hidden types, whose
 * attendees collapse to the creator) or as a fallback when no participant
 * carries a department, so the event still has a calendar to live in. Nulls
 * (people without a department) contribute nothing.
 */
export function deriveTargetCalendarIds(params: {
  creatorDepartmentId: string | null;
  invitedUserDepartmentIds: (string | null)[];
  invitedDepartmentIds: string[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of params.invitedUserDepartmentIds) {
    addUnique(out, seen, id);
  }
  for (const id of params.invitedDepartmentIds) {
    addUnique(out, seen, id);
  }
  if (out.length === 0) {
    addUnique(out, seen, params.creatorDepartmentId);
  }
  return out;
}

/**
 * Superset used to locate every copy of an existing event for reconciliation
 * (update/delete), regardless of which rule placed it: the organizer's home
 * department plus each participant department. Copies written before the
 * organizer stopped being a target live in the organizer's department, so the
 * reconcile read must still cover it even though new writes no longer do.
 */
export function deriveLegacyTargetCalendarIds(params: {
  creatorDepartmentId: string | null;
  invitedUserDepartmentIds: (string | null)[];
  invitedDepartmentIds: string[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  addUnique(out, seen, params.creatorDepartmentId);
  for (const id of params.invitedUserDepartmentIds) {
    addUnique(out, seen, id);
  }
  for (const id of params.invitedDepartmentIds) {
    addUnique(out, seen, id);
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
    ownerOnlyEdits: event.payload.ownerOnlyEdits,
  };
}
