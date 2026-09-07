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
  /** Whether the event form shows the Participants step. */
  showInvitees: boolean;
  /**
   * Whether the event form shows the Location step. When off, the wizard
   * skips it and events save in the type's sole allowed category with no
   * specific location — only valid when `allowedLocations` has exactly one
   * entry.
   */
  showLocation: boolean;
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
  showLocation?: string;
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
  } else if (
    values.showLocation === false &&
    (values.allowedLocations.length !== 1 ||
      !values.allowedLocations.every(isLocationCategory))
  ) {
    errors.allowedLocations =
      "The Location step can only be hidden when exactly one location is allowed";
  }
  return errors;
}
