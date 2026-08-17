/**
 * Pure validation/normalization helpers for the event types screen. Kept free
 * of I/O so they can be unit-tested without a database.
 */

import type { TimeOption } from "@/lib/events/timeOptions";

export interface EventTypeFormValues {
  name: string;
  shortname: string;
  /** Selectable datetime options; at least one must be enabled. */
  timeOptions: TimeOption[];
}

export interface EventTypeFormErrors {
  name?: string;
  shortname?: string;
  timeOptions?: string;
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
  if (!Array.isArray(values.timeOptions) || values.timeOptions.length === 0) {
    errors.timeOptions = "Select at least one time option";
  }
  return errors;
}
