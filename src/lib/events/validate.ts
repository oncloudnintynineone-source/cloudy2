/**
 * Pure validation/normalization helpers for the calendar event form. Kept free
 * of I/O so they can be unit-tested without a database or Google credentials.
 *
 * `start`/`end` are naive `YYYY-MM-DD HH:mm:ss` strings. For full-day events the
 * time part is always `00:00:00` and the AM/PM indicators (start/end) add the
 * half-of-day ordering — so the chronological comparison folds the indicator
 * into the sort key (`YYYY-MM-DD AM` < `YYYY-MM-DD PM`).
 */

import type { AmPm, TimeOption } from "./timeOptions";

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
  /** Event creator (kept on edit; set from the session on create). No validation. */
  creatorId: string;
  /** User ids tagged on the event (schedule view rows). No validation. */
  inviteeUserIds: string[];
  /** Department (calendar) ids tagged on the event (schedule view rows). No validation. */
  inviteeDepartments: string[];
}

export interface EventFormErrors {
  title?: string;
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
  if (values.timeOption === "full" && amPm) {
    return `${naive.slice(0, 10)} ${amPm}`;
  }
  return naive;
}

/**
 * Guarantee the event creator is always one of the tagged invitees, so the
 * creator can never be excluded from an event they created. The creator's id
 * is deduped into the invitee list; empty creators are left untouched.
 */
export function withCreatorInvited(values: EventFormValues): EventFormValues {
  const creatorId = values.creatorId;
  if (!creatorId) {
    return values;
  }
  const inviteeUserIds = [...new Set([creatorId, ...values.inviteeUserIds])];
  return { ...values, inviteeUserIds };
}

export function validateEventForm(values: EventFormValues): EventFormErrors {
  const errors: EventFormErrors = {};

  if (!values.title.trim()) {
    errors.title = "Description is required";
  }
  if (values.timeOption === "full") {
    if (!values.startAmPm) {
      errors.startAmPm = "Select AM or PM";
    }
    if (!values.endAmPm) {
      errors.endAmPm = "Select AM or PM";
    }
  }
  if (!values.start) {
    errors.start = "Start is required";
  }
  if (!values.end) {
    errors.end = "End is required";
  }
  if (values.start && values.end && sortKey(values, false) > sortKey(values, true)) {
    errors.end = "End must be on or after start";
  }

  return errors;
}
