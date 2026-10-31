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
  parseEventPinnedDepartments,
  parseEventRegistrationCap,
  parseEventRegistrationEnabled,
  parseEventStartAmPm,
  parseEventTimeOption,
  parseEventTitle,
  parseEventType,
} from "./notes";
import type { EventFormValues } from "./validate";
import type { GcalEventItem } from "@/lib/google/types";

export type RegistrationIntent = "register" | "deregister";

/** Unique, non-empty explicit registrant ids — the seats a cap counts. */
export function registrationSeatCount(userIds: readonly string[] | null | undefined): number {
  return new Set((userIds ?? []).filter((id) => typeof id === "string" && id.length > 0)).size;
}

/**
 * Whether a self-registration would be rejected because the explicit roster is
 * already at or above the cap. An absent/null cap means unlimited, and an
 * already-registered user is never blocked (they can always deregister).
 */
export function isRegistrationFull(
  userIds: readonly string[] | null | undefined,
  cap: number | null | undefined,
  userId?: string,
): boolean {
  if (cap == null) {
    return false;
  }
  const ids = userIds ?? [];
  if (userId && ids.includes(userId)) {
    return false;
  }
  return registrationSeatCount(ids) >= cap;
}

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
    registrationEnabled: parseEventRegistrationEnabled(copy.description),
    registrationCap: parseEventRegistrationCap(copy.description),
    ownerOnlyEdits: parseEventOwnerOnlyEdits(copy.description),
    outOfCamp: parseEventOutOfCamp(copy.description),
    overseas: parseEventOverseas(copy.description),
    pinned: parseEventPinned(copy.description),
    pinnedDepartments: parseEventPinnedDepartments(copy.description),
    location: copy.location ?? "",
  };
}
