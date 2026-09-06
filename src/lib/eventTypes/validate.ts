/**
 * Pure validation/normalization helpers for the event types screen. Kept free
 * of I/O so they can be unit-tested without a database.
 */

import { isLocationCategory, type LocationCategory } from "@/lib/events/locationPolicy";
import type { TimeOption } from "@/lib/events/timeOptions";

export interface EventTypeFormValues {
  name: string;
  shortname: string;
  /** Selectable datetime options; at least one must be enabled. */
  timeOptions: TimeOption[];
  /** Location categories events of this type may take place in; at least one. */
  allowedLocations: LocationCategory[];
  /** Whether the event form shows the Remarks (description) step. */
  showRemarks: boolean;
  /** Whether the event form shows the Invited Attendees step. */
  showInvitees: boolean;
  /**
   * The location category events of this type are locked to; "" = users pick
   * in the event form (within `allowedLocations`). A locked type skips the
   * wizard's Location step and every event saves with this category.
   */
  lockedLocation: LocationCategory | "";
  /** Pinned event color (Mantine palette name); "" = the name-derived default. */
  color?: string;
  /** Display group for the type picker; null/"" = ungrouped. */
  groupId?: string | null;
}

export interface EventTypeFormErrors {
  name?: string;
  shortname?: string;
  timeOptions?: string;
  allowedLocations?: string;
  lockedLocation?: string;
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
  if (
    !Array.isArray(values.allowedLocations) ||
    values.allowedLocations.length === 0 ||
    !values.allowedLocations.every(isLocationCategory)
  ) {
    errors.allowedLocations = "Select at least one location";
  }
  if (values.lockedLocation !== "" && !isLocationCategory(values.lockedLocation)) {
    errors.lockedLocation = "Invalid locked location";
  }
  return errors;
}
