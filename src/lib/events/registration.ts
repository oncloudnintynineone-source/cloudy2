/**
 * Pure helpers for registration-enabled events. A registration event stores
 * its roster in the ordinary participant list (`inviteeUsers`), so a
 * self-registration is a narrow participant toggle around the shared update
 * pipeline. Keeping the toggle and the "rebuild form values from the stored
 * copy" logic pure makes both the server action and its tests independent of
 * Google/DB I/O.
 */

import { formatInstantToNaive, subOneDay, utcToDateString } from "./datetime";
import {
  parseEventEndAmPm,
  parseEventNotes,
  parseEventOutOfCamp,
  parseEventOverseas,
  parseEventOwnerOnlyEdits,
  parseEventPeople,
  parseEventPinned,
  parseEventStartAmPm,
  parseEventTimeOption,
  parseEventTitle,
  parseEventType,
} from "./notes";
import type { EventFormValues } from "./validate";
import type { GcalEventItem } from "@/lib/google/types";

export type RegistrationIntent = "register" | "deregister";

/**
 * Apply a self-registration intent to a participant id list. Registration
 * appends the user once (preserving the existing order); deregistration
 * removes every matching entry. Idempotent — the returned array is unchanged
 * when the intent is already satisfied.
 */
export function applyRegistrationIntent(
  userIds: readonly string[],
  userId: string,
  intent: RegistrationIntent,
): string[] {
  const unique = [...new Set(userIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (intent === "register") {
    return unique.includes(userId) ? unique : [...unique, userId];
  }
  return unique.filter((id) => id !== userId);
}

/**
 * Whether the stored copy is a registration event. The notes' event type name
 * is the lookup key (the same read-time convention every per-type flag uses).
 */
export function storedEventTypeName(copy: GcalEventItem): string | null {
  return parseEventType(copy.description);
}

/**
 * Rebuild the wizard's form values from a stored copy so a registration action
 * can re-run the shared update pipeline without trusting client-supplied event
 * fields. All non-participant fields are preserved; the caller only toggles
 * `inviteeUserIds`.
 *
 * Google stores an all-day end as the exclusive next day, while the form uses
 * an inclusive last day, so that side is converted back here (the same
 * conversion `buildInitialValues` performs for an edit).
 */
export function eventFormValuesFromCopy(copy: GcalEventItem): EventFormValues | null {
  const notes = parseEventNotes(copy.description);
  if (!notes) {
    return null;
  }
  const people = parseEventPeople(copy.description);
  const timeOption = parseEventTimeOption(copy.description) ?? (copy.allDay ? "full" : "range");
  const start = copy.allDay
    ? `${utcToDateString(copy.start)} 00:00:00`
    : formatInstantToNaive(copy.start);
  const end = copy.allDay
    ? `${subOneDay(utcToDateString(copy.end))} 00:00:00`
    : formatInstantToNaive(copy.end);
  return {
    title: parseEventTitle(copy.description) ?? copy.title,
    timeOption,
    startAmPm: parseEventStartAmPm(copy.description) ?? "AM",
    endAmPm: parseEventEndAmPm(copy.description) ?? "PM",
    start,
    end,
    eventType: parseEventType(copy.description) ?? "",
    creatorId: people.creatorId ?? "",
    inviteeUserIds: people.userIds,
    inviteeDepartments: people.departmentIds,
    ownerOnlyEdits: parseEventOwnerOnlyEdits(copy.description),
    outOfCamp: parseEventOutOfCamp(copy.description),
    overseas: parseEventOverseas(copy.description),
    pinned: parseEventPinned(copy.description),
    location: copy.location ?? "",
  };
}
