/**
 * Pure validation/normalization helpers for the calendar event form. Kept free
 * of I/O so they can be unit-tested without a database or Google credentials.
 *
 * `start`/`end` are naive `YYYY-MM-DD HH:mm:ss` strings, so chronological
 * comparison reduces to a simple string comparison.
 */

export interface EventFormValues {
  title: string;
  allDay: boolean;
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
  start?: string;
  end?: string;
  [key: string]: string | undefined;
}

export function validateEventForm(values: EventFormValues): EventFormErrors {
  const errors: EventFormErrors = {};

  if (!values.title.trim()) {
    errors.title = "Description is required";
  }
  if (!values.start) {
    errors.start = "Start is required";
  }
  if (!values.end) {
    errors.end = "End is required";
  }
  if (values.start && values.end && values.end < values.start) {
    errors.end = "End must be on or after start";
  }

  return errors;
}
