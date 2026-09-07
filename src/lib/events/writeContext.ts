/**
 * Shared write-side event resolution used by the mutation server actions
 * (`actions.ts`) and the read-only pre-submit clash check
 * (`clashActions.ts`). Keeping the chain here — a plain module, never
 * `"use server"` — means both paths resolve an `EventFormValues` payload to
 * its effective form identically, so the clash advisory always reasons about
 * exactly the event the create/update would save (same time option clamp, same
 * allowed-location clamp, same hidden-invitees/remarks field dropping, same
 * target-calendar derivation). See docs/event-lifecycle.md §1.5–1.6 and
 * docs/event-mutations.md.
 */

import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { calendars } from "@/db/schema";
import { getUserDepartmentIds } from "@/lib/events/queries";
import { clampEventEnd, type EventFormValues } from "@/lib/events/validate";
import { deriveTargetCalendarIds, type EventRef } from "@/lib/events/targets";
import {
  clampOutOfCamp,
  flagsFromCategory,
  type LocationCategory,
} from "@/lib/events/locationPolicy";
import { resolveTimeOption, type TimeOption } from "@/lib/events/timeOptions";
import { getEventTypesByNames } from "@/lib/eventTypes/queries";
import { getUsersByIds } from "@/lib/roster/queries";
import type { EventTitlePerson, EventTitleType } from "@/lib/settings/formatEventTitle";
import { formatFullName } from "@/lib/settings/formatName";
import { getSettings } from "@/lib/settings/queries";

/** Resolve-once display data behind the event title template tokens. */
export interface EventTitleContext {
  template: string;
  eventType: EventTitleType | null;
  people: EventTitlePerson[];
  departments: string[];
  /** Datetime options the event type allows; empty when the event has no type. */
  timeOptions: TimeOption[];
  /**
   * The event type's allowed location categories; undefined when the event
   * has no type (no restriction).
   */
  allowedLocations: LocationCategory[] | null;
  /** Whether the event type shows the Remarks (description) field. */
  showRemarks: boolean;
  /** Whether the event type shows the Participants field. */
  showInvitees: boolean;
  /**
   * Whether the wizard shows the Location step for this type. When false, the
   * type has a sole allowed location and events save in it with no specific
   * location.
   */
  showLocation: boolean;
}

/**
 * Resolve the invited people (plain name, acronym, fully qualified name via
 * the display-name template), the event type's shortname, and department names
 * a title template can render. Unknown ids are dropped; malformed invitee
 * arrays are coerced.
 */
export async function buildEventTitleContext(input: EventFormValues): Promise<EventTitleContext> {
  const settings = await getSettings();
  const inviteeUserIds = [
    ...new Set(Array.isArray(input.inviteeUserIds) ? input.inviteeUserIds : []),
  ];
  const inviteeDepartments = Array.isArray(input.inviteeDepartments)
    ? input.inviteeDepartments
    : [];
  const eventTypeName = input.eventType.trim();
  const [userRows, departmentNames, eventTypesByName] = await Promise.all([
    getUsersByIds(inviteeUserIds),
    calendarNames(inviteeDepartments),
    getEventTypesByNames(eventTypeName ? [eventTypeName] : []),
  ]);
  const eventTypeRow = eventTypeName ? eventTypesByName.get(eventTypeName) : undefined;
  const inviteesHidden = eventTypeRow ? eventTypeRow.showInvitees === false : false;
  // Types with invitees disabled carry no attendees beyond the creator, so the
  // {people} token never names someone the event no longer has.
  const peopleUserIds = inviteesHidden
    ? input.creatorId
      ? [input.creatorId]
      : []
    : inviteeUserIds;
  const userById = new Map(userRows.map((user) => [user.id, user]));
  const people = peopleUserIds.flatMap((id) => {
    const user = userById.get(id);
    if (!user) {
      return [];
    }
    return [
      {
        full: user.name,
        acronym: user.shortname || user.name,
        fqn: formatFullName(
          { name: user.name, departmentName: user.departmentName },
          settings.nameTemplate,
        ),
      },
    ];
  });
  const eventType: EventTitleType | null = eventTypeName
    ? { name: eventTypeName, acronym: eventTypeRow?.shortname ?? eventTypeName }
    : null;
  return {
    template: settings.eventTitleTemplate,
    eventType,
    people,
    departments: inviteesHidden ? [] : inviteeDepartments.map((id) => departmentNames[id] ?? ""),
    timeOptions: eventTypeRow?.timeOptions ?? [],
    allowedLocations: eventTypeRow ? eventTypeRow.allowedLocations : null,
    showRemarks: eventTypeRow ? eventTypeRow.showRemarks : true,
    showInvitees: eventTypeRow ? eventTypeRow.showInvitees : true,
    showLocation: eventTypeRow ? eventTypeRow.showLocation : true,
  };
}

/**
 * Department calendars a logical event must live in, from its creator +
 * invitees. When nothing derives (e.g. a legacy event with no creator stored)
 * and a fallback calendar is given, that calendar alone is the target set.
 */
export async function resolveTargetCalendars(
  input: {
    creatorId: string;
    inviteeUserIds: string[];
    inviteeDepartments: string[];
  },
  fallbackCalendarId: string | null,
): Promise<string[]> {
  const inviteeUserIds = Array.isArray(input.inviteeUserIds) ? input.inviteeUserIds : [];
  const inviteeDepartments = Array.isArray(input.inviteeDepartments)
    ? input.inviteeDepartments
    : [];
  const ids = [...new Set([...(input.creatorId ? [input.creatorId] : []), ...inviteeUserIds])];
  const userDepartments = ids.length > 0 ? await getUserDepartmentIds(ids) : {};
  const derived = deriveTargetCalendarIds({
    creatorDepartmentId: input.creatorId ? (userDepartments[input.creatorId] ?? null) : null,
    invitedUserDepartmentIds: inviteeUserIds.map((id) => userDepartments[id] ?? null),
    invitedDepartmentIds: inviteeDepartments,
  });
  return derived.length > 0 ? derived : fallbackCalendarId ? [fallbackCalendarId] : [];
}

/** Target set for an existing (representative) copy, from its own people fields. */
export async function refTargetCalendars(ref: EventRef): Promise<string[]> {
  return resolveTargetCalendars(
    {
      creatorId: ref.creatorId ?? "",
      inviteeUserIds: ref.inviteeUserIds,
      inviteeDepartments: ref.inviteeDepartmentIds,
    },
    ref.calendarId,
  );
}

/**
 * Clamp the form's chosen datetime option to what the event type allows
 * (unknown names and untyped events fall back to the default "range"), and
 * default the start/end AM/PM indicators for "half" events.
 */
export function resolveEventTime(
  input: EventFormValues,
  context: EventTitleContext,
): EventFormValues {
  const timeOption = resolveTimeOption(context.timeOptions, input.timeOption);
  return {
    ...input,
    timeOption,
    startAmPm: timeOption === "half" ? (input.startAmPm === "PM" ? "PM" : "AM") : "",
    endAmPm: timeOption === "half" ? (input.endAmPm === "PM" ? "PM" : "AM") : "",
  };
}

/**
 * Ensure `end` is never before `start` (e.g. stale client where start was
 * moved past end). Mirrors the client-side auto-clamp so a direct API call
 * cannot create an inverted range. No-ops on incomplete sides — validation
 * still reports required fields. Must run after `resolveEventTime` so
 * half-day indicators are normalized.
 */
export function resolveEventDates(input: EventFormValues): EventFormValues {
  return clampEventEnd(input);
}

/**
 * Enforce the event type's allowed locations on the Out of Camp / overseas
 * flags and location (in-camp events keep an optional specific location; an
 * exclusively in-camp type forces both flags off; an out-of-camp-only type
 * forces the category out). Applied after {@link resolveEventTime} in both
 * create and update so a stale form state can never submit an out-of-policy
 * category.
 */
export function resolveEventLocation(
  input: EventFormValues,
  context: EventTitleContext,
): EventFormValues {
  // A type whose Location step is hidden pins its sole allowed location and
  // carries no specific location — the wizard has no Location step for it, so
  // drop whatever a stale form state (or a legacy event) still held. When the
  // flag is somehow set without a single allowed location, fall back to the
  // normal matrix clamp rather than inventing a category.
  if (context.showLocation === false && context.allowedLocations?.length === 1) {
    const flags = flagsFromCategory(context.allowedLocations[0]);
    return { ...input, ...flags, location: "" };
  }
  const location = input.location.trim();
  const clamped = clampOutOfCamp(
    context.allowedLocations,
    input.outOfCamp,
    input.overseas,
    location,
  );
  return {
    ...input,
    outOfCamp: clamped.outOfCamp,
    overseas: clamped.overseas,
    location: clamped.location,
  };
}

/**
 * Drop form fields the event type hides: a type with remarks disabled carries
 * no description, and a type with invitees disabled carries no attendees
 * beyond the creator. Runs after {@link resolveEventLocation} so the title the
 * template renders (from type/people/location tokens) is the only text a
 * no-remarks event gets.
 */
export function resolveEventFields(
  input: EventFormValues,
  context: EventTitleContext,
): EventFormValues {
  let next = input;
  if (!context.showRemarks) {
    next = { ...next, title: "" };
  }
  if (!context.showInvitees) {
    next = {
      ...next,
      inviteeUserIds: next.creatorId ? [next.creatorId] : [],
      inviteeDepartments: [],
    };
  }
  return next;
}

/** Registry calendar id → name (used for title context + clash display). */
export async function calendarNames(calendarIds: string[]): Promise<Record<string, string>> {
  if (calendarIds.length === 0) {
    return {};
  }
  const rows = await db
    .select({ id: calendars.id, name: calendars.name })
    .from(calendars)
    .where(inArray(calendars.id, calendarIds));
  return Object.fromEntries(rows.map((row) => [row.id, row.name]));
}

/**
 * The full effective-resolution chain a create/update applies after its
 * guards and validation: time option → location → field dropping. The clash
 * check reuses this exact chain so its advisory matches the saved event.
 */
export function resolveEffectiveInput(
  normalized: EventFormValues,
  context: EventTitleContext,
): EventFormValues {
  return resolveEventFields(
    resolveEventLocation(resolveEventDates(resolveEventTime(normalized, context)), context),
    context,
  );
}
