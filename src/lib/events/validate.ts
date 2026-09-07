/**
 * Pure validation/normalization helpers for the calendar event form. Kept free
 * of I/O so they can be unit-tested without a database or Google credentials.
 *
 * `start`/`end` are naive `YYYY-MM-DD HH:mm:ss` strings. For half-day events
 * the time part is always `00:00:00` and the AM/PM indicators (start/end) add
 * the half-of-day ordering — so the chronological comparison folds the
 * indicator into the sort key (`YYYY-MM-DD AM` < `YYYY-MM-DD PM`).
 */

import { naiveTimePart, type AmPm, type TimeOption } from "./timeOptions";

export interface EventFormValues {
  title: string;
  /** Selected datetime option ("range" = timed, "full" = full-day). */
  timeOption: TimeOption;
  /** Start half-of-day indicator, required for "full" events. */
  startAmPm: AmPm;
  /** End half-of-day indicator, required for "full" events. */
  endAmPm: AmPm;
  start: string;
  end: string;
  eventType: string;
  /**
   * Event organizer id — fixed at creation to the acting session user and never
   * changed by an edit (the server derives it; this field is informational on
   * submit). The organizer is NOT merged into the invitee list. No validation.
   */
  creatorId: string;
  /** User ids tagged on the event (schedule view rows). No validation. */
  inviteeUserIds: string[];
  /** Department (calendar) ids tagged on the event (schedule view rows). No validation. */
  inviteeDepartments: string[];
  /**
   * Whether only the organizer (and admins) may edit/delete/duplicate this
   * event. Absent/false lets attendees and active members of tagged
   * departments edit too. The organizer (or an admin) may toggle it on edit;
   * other editors keep the stored value. No validation.
   */
  ownerOnlyEdits: boolean;
  /** Whether the event takes place out of camp (in-camp events may still record an optional location). */
  outOfCamp: boolean;
  /** Whether the out-of-camp event is outside the country (KAH "away"). */
  overseas: boolean;
  /** Whether the event is explicitly marked as pinned (Pinned Events panel). No validation. */
  pinned: boolean;
  /** Location of the event; an optional specific place even for in-camp events. */
  location: string;
}

export interface EventFormErrors {
  startAmPm?: string;
  endAmPm?: string;
  start?: string;
  end?: string;
  [key: string]: string | undefined;
}

/** Chronological sort key for a side, folding the half-of-day indicator in. */
function sortKey(values: EventFormValues, end: boolean): string {
  const naive = end ? values.end : values.start;
  const amPm = end ? values.endAmPm : values.startAmPm;
  if (values.timeOption === "half" && amPm) {
    return `${naive.slice(0, 10)} ${amPm}`;
  }
  return naive;
}

/**
 * Clamp `end` so it is never before `start`. Returns a new values object
 * with `end` (and for half-day, `endAmPm`) bumped to `start` when the sort
 * key ordering would otherwise fail validation. No-ops when either side is
 * incomplete (blank date or, for range, missing time part) so required-field
 * errors still surface.
 *
 * Mirrors `validateEventForm`'s ordering check (`sortKey` comparison) so
 * client and server stay in sync. Intended for use on every start/end edit
 * and as a server-side safety net (like `clampOutOfCamp`).
 */
export function clampEventEnd(values: EventFormValues): EventFormValues {
  if (!values.start || !values.end) {
    return values;
  }
  const startComplete =
    !!values.start && (values.timeOption !== "range" || !!naiveTimePart(values.start));
  const endComplete =
    !!values.end && (values.timeOption !== "range" || !!naiveTimePart(values.end));
  if (!startComplete || !endComplete) {
    return values;
  }
  if (sortKey(values, false) <= sortKey(values, true)) {
    return values;
  }
  // End is before start — snap end to start. For half-day also snap the
  // indicator so "2026-08-15 PM → AM" becomes "PM → PM".
  if (values.timeOption === "half") {
    return {
      ...values,
      end: `${values.start.slice(0, 10)} 00:00:00`,
      endAmPm: values.startAmPm || values.endAmPm,
    };
  }
  return { ...values, end: values.start };
}

/** Whether `values` would need clamping (`end` before `start`). Pure helper for UI affordances. */
export function needsClamp(values: EventFormValues): boolean {
  if (!values.start || !values.end) {
    return false;
  }
  const startComplete =
    !!values.start && (values.timeOption !== "range" || !!naiveTimePart(values.start));
  const endComplete =
    !!values.end && (values.timeOption !== "range" || !!naiveTimePart(values.end));
  if (!startComplete || !endComplete) {
    return false;
  }
  return sortKey(values, false) > sortKey(values, true);
}

/**
 * Resolve the event's organizer and edit lock for the write path. The
 * organizer is fixed at creation: a new event always records the acting
 * session user; an edit keeps the stored organizer (adopting the acting
 * editor on a creator-less legacy/external first edit). The organizer is never
 * merged into the invitee list — it participates only when explicitly invited.
 *
 * The owner-only edit lock may only change when the actor is the organizer or
 * an admin (`canChangeLock`); every other editor keeps the stored value, so an
 * attendee editing an event can never lock it. Pure — session id/role arrive
 * pre-decided from the caller.
 */
export function resolveEventAuthor(
  values: EventFormValues,
  sessionUserId: string,
  ref: { creatorId: string | null; ownerOnlyEdits: boolean } | null,
  canChangeLock: boolean,
): EventFormValues {
  const creatorId = ref ? ref.creatorId || sessionUserId : sessionUserId;
  return {
    ...values,
    creatorId,
    ownerOnlyEdits: ref ? (canChangeLock ? values.ownerOnlyEdits : ref.ownerOnlyEdits) : values.ownerOnlyEdits,
  };
}

export function validateEventForm(values: EventFormValues): EventFormErrors {
  const errors: EventFormErrors = {};

  if (values.timeOption === "half") {
    if (!values.startAmPm) {
      errors.startAmPm = "Select AM or PM";
    }
    if (!values.endAmPm) {
      errors.endAmPm = "Select AM or PM";
    }
  }
  if (!values.start) {
    errors.start = "Start is required";
  } else if (values.timeOption === "range" && !naiveTimePart(values.start)) {
    // Start & End is always timed; a cleared time picker stores a bare date.
    errors.start = "Start time is required";
  }
  if (!values.end) {
    errors.end = "End is required";
  } else if (values.timeOption === "range" && !naiveTimePart(values.end)) {
    errors.end = "End time is required";
  }
  // The ordering check needs a complete value on both sides; an unfinished
  // range side (missing time part) already reports its own error.
  const startComplete =
    !!values.start && (values.timeOption !== "range" || !!naiveTimePart(values.start));
  const endComplete = !!values.end && (values.timeOption !== "range" || !!naiveTimePart(values.end));
  if (startComplete && endComplete && sortKey(values, false) > sortKey(values, true)) {
    errors.end = "End must be on or after start";
  }

  return errors;
}
