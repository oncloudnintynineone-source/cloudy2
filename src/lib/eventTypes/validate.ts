/**
 * Pure validation/normalization helpers for the event types screen. Kept free
 * of I/O so they can be unit-tested without a database.
 */

export interface EventTypeFormValues {
  name: string;
  shortname: string;
}

export interface EventTypeFormErrors {
  name?: string;
  shortname?: string;
  [key: string]: string | undefined;
}

export function validateEventTypeForm(values: EventTypeFormValues): EventTypeFormErrors {
  const errors: EventTypeFormErrors = {};
  if (!values.name.trim()) {
    errors.name = "Name is required";
  }
  if (!values.shortname?.trim()) {
    errors.shortname = "Shortname is required";
  }
  return errors;
}
