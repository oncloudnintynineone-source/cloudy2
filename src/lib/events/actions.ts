"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { describeError } from "@/db/pgErrors";
import { calendars } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { logAction } from "@/lib/audit/log";
import { appBaseUrl } from "@/lib/appUrl";
import { absEventRange, monthsInRange } from "@/lib/events/datetime";
import {
  buildEventSnapshot,
  snapshotFromCopy,
  type EventSnapshotNames,
  type EventTimeParts,
} from "@/lib/events/eventAudit";
import {
  encodeEventNotes,
  encodeNotesBlock,
  eventDetailUrl,
  parseEventPeople,
  withEditLink,
  withInternalMarker,
} from "@/lib/events/notes";
import { clampOutOfCamp, type LocationCategory } from "@/lib/events/locationPolicy";
import { creatorGuard, ownershipGuard } from "@/lib/events/guards";
import { dispatchKahBreachCheck } from "@/lib/kah/notify";
import { naiveTimePart, resolveTimeOption, type TimeOption } from "@/lib/events/timeOptions";
import { renderEventTitle } from "@/lib/events/eventTitle";
import { getUserDepartmentIds } from "@/lib/events/queries";
import { invalidatePinnedCache } from "@/lib/events/pinned";
import { deriveTargetCalendarIds, type EventRef } from "@/lib/events/targets";
import {
  clampEventEnd,
  validateEventForm,
  withSelfCreator,
  type EventFormValues,
} from "@/lib/events/validate";
import { getEventTypesByNames } from "@/lib/eventTypes/queries";
import {
  getGoogleIntegration,
  googleCalendarConfigured,
  type GcalEventInput,
  type GcalEventItem,
} from "@/lib/google";
import { invalidateGcalCache } from "@/lib/google/eventsCache";
import { getUsersByIds, type UserDisplayInfo } from "@/lib/roster/queries";
import { resolveGoogleCalendarId } from "@/lib/roster/shares";
import {
  type EventTitlePerson,
  type EventTitleType,
} from "@/lib/settings/formatEventTitle";
import { formatFullName } from "@/lib/settings/formatName";
import { getSettings } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";
import { dispatchEventWebhook } from "@/lib/webhooks/deliver";
import { WEBHOOK_ACTIONS } from "@/lib/webhooks/payload";

export type EventResultField = "title" | "start" | "end" | "startAmPm" | "endAmPm" | "creatorId";

export type EventActionResult =
  { ok: true } | { ok: false; error: string; field?: EventResultField };

/** User id → name map from a roster lookup, for audit snapshot display. */
function namesById(rows: UserDisplayInfo[]): Record<string, string> {
  return Object.fromEntries(rows.map((user) => [user.id, user.name]));
}

/** The snapshot's datetime parts from a (resolved) event form. */
function timePartsOf(values: EventFormValues): EventTimeParts {
  return {
    timeOption: values.timeOption,
    start: values.start,
    end: values.end,
    startAmPm: values.startAmPm,
    endAmPm: values.endAmPm,
  };
}

function actorFrom(session: Awaited<ReturnType<typeof requireSession>>) {
  return actorFromUser({
    id: session.user.id,
    name: session.user.name ?? null,
    role: session.user.role,
  });
}

/** Actor fields of the outbound event webhook payload. */
function webhookActorFrom(session: Awaited<ReturnType<typeof requireSession>>) {
  return { name: session.user.name ?? null, role: session.user.role };
}

interface AbsRange {
  start: Date;
  end: Date;
}

function unionRange(a: AbsRange, b: AbsRange): AbsRange {
  return {
    start: new Date(Math.min(a.start.getTime(), b.start.getTime())),
    end: new Date(Math.max(a.end.getTime(), b.end.getTime())),
  };
}

/** Grow a range by a day each side so copies drifted slightly in Google are still found. */
function withMargin(range: AbsRange): AbsRange {
  const marginMs = 24 * 60 * 60 * 1000;
  return {
    start: new Date(range.start.getTime() - marginMs),
    end: new Date(range.end.getTime() + marginMs),
  };
}

/**
 * Department calendars a logical event must live in, from its creator +
 * invitees. When nothing derives (e.g. a legacy event with no creator stored)
 * and a fallback calendar is given, that calendar alone is the target set.
 */
async function resolveTargetCalendars(
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
async function refTargetCalendars(ref: EventRef): Promise<string[]> {
  return resolveTargetCalendars(
    {
      creatorId: ref.creatorId ?? "",
      inviteeUserIds: ref.inviteeUserIds,
      inviteeDepartments: ref.inviteeDepartmentIds,
    },
    ref.calendarId,
  );
}

/** Resolve-once display data behind the event title template tokens. */
interface EventTitleContext {
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
  /** Whether the event type shows the Invited Attendees field. */
  showInvitees: boolean;
}

/**
 * Resolve the invited people (plain name, acronym, fully qualified name via
 * the display-name template), the event type's shortname, and department names
 * a title template can render. Unknown ids are dropped; malformed invitee
 * arrays are coerced.
 */
async function buildEventTitleContext(input: EventFormValues): Promise<EventTitleContext> {
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
  };
}

/**
 * Clamp the form's chosen datetime option to what the event type allows
 * (unknown names and untyped events fall back to the default "range"), and
 * default the start/end AM/PM indicators for "half" events.
 */
function resolveEventTime(input: EventFormValues, context: EventTitleContext): EventFormValues {
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
function resolveEventDates(input: EventFormValues): EventFormValues {
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
function resolveEventLocation(input: EventFormValues, context: EventTitleContext): EventFormValues {
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
function resolveEventFields(input: EventFormValues, context: EventTitleContext): EventFormValues {
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

async function buildGcalEventInput(
  googleCalendarId: string,
  input: EventFormValues,
  eventId: string,
  titleContext: EventTitleContext,
): Promise<GcalEventInput> {
  const rawTitle = input.title.trim();
  const title = renderEventTitle({
    description: input.title,
    eventType: titleContext.eventType,
    people: titleContext.people,
    departments: titleContext.departments,
    location: input.location,
    template: titleContext.template,
    timeOption: input.timeOption,
    startTime: naiveTimePart(input.start),
    endTime: naiveTimePart(input.end),
    startAmPm: input.startAmPm,
    endAmPm: input.endAmPm,
  });
  // The notes carry an "Edit:" link (shown on top of the opaque block) that
  // opens this event's details modal (edit / duplicate / delete one tap in);
  // it is rebuilt on every create/edit so the embedded date stays current for
  // in-app reschedules.
  const detailLink = eventDetailUrl(await appBaseUrl(), input.start, eventId);
  const block = encodeNotesBlock(
    encodeEventNotes({
      eventId,
      eventType: input.eventType || undefined,
      createdBy: input.creatorId || undefined,
      inviteeUsers: input.inviteeUserIds,
      inviteeDepartments: input.inviteeDepartments,
      title: rawTitle,
      timeOption: input.timeOption,
      startAmPm: input.timeOption === "half" ? input.startAmPm : undefined,
      endAmPm: input.timeOption === "half" ? input.endAmPm : undefined,
      outOfCamp: input.outOfCamp || undefined,
      overseas: input.outOfCamp && input.overseas ? true : undefined,
      pinned: input.pinned || undefined,
    }),
  );
  // The marker line at the bottom flags the event as created in the app, so
  // externally created (Google-only) events can be told apart on read.
  const description = withInternalMarker(withEditLink(block, detailLink));

  const allDay = input.timeOption !== "range";
  const { start, end } = absEventRange(input.start, input.end, allDay);
  return {
    calendarId: googleCalendarId,
    title,
    description,
    allDay,
    location: input.location,
    start,
    end,
  };
}

/**
 * Copies (in one target calendar) of the logical event: items whose notes
 * carry the group id, plus — on a legacy first edit/delete — the original copy
 * matched by Google event id (it has no group id yet). Full items are returned
 * so callers can snapshot the pre-change state from the first copy found.
 */
async function findCopies(
  googleCalendarId: string,
  eventId: string,
  range: AbsRange,
  legacyFallback: { googleCalendarId: string; googleEventId: string } | null,
): Promise<GcalEventItem[]> {
  const integration = await getGoogleIntegration();
  const items = await integration.listEvents(googleCalendarId, range.start, range.end);
  return items.filter((item) => {
    if (parseEventPeople(item.description).eventId === eventId) {
      return true;
    }
    return (
      legacyFallback !== null &&
      googleCalendarId === legacyFallback.googleCalendarId &&
      item.id === legacyFallback.googleEventId
    );
  });
}

/** Google calendar id of the representative copy's registry row, or null. */
async function legacyFallback(ref: EventRef): Promise<{
  googleCalendarId: string;
  googleEventId: string;
} | null> {
  if (ref.eventId !== null) {
    return null;
  }
  const googleCalendarId = await resolveGoogleCalendarId(ref.calendarId);
  return googleCalendarId ? { googleCalendarId, googleEventId: ref.googleEventId } : null;
}

async function calendarNames(calendarIds: string[]): Promise<Record<string, string>> {
  if (calendarIds.length === 0) {
    return {};
  }
  const rows = await db
    .select({ id: calendars.id, name: calendars.name })
    .from(calendars)
    .where(inArray(calendars.id, calendarIds));
  return Object.fromEntries(rows.map((row) => [row.id, row.name]));
}

export async function createEvent(input: EventFormValues): Promise<EventActionResult> {
  const session = await requireSession();
  // "On behalf of" is optional: a blank creator means the acting user.
  // Clamp end to start before validation so a stale client with an inverted
  // range auto-corrects instead of surfacing "End must be on or after start".
  const normalized = clampEventEnd(withSelfCreator(input, session.user.id));

  const creatorError = creatorGuard(session, normalized.creatorId, null);
  if (creatorError) {
    return { ok: false, error: creatorError };
  }

  const errors = validateEventForm(normalized);
  if (Object.keys(errors).length > 0) {
    const firstField = Object.keys(errors)[0] as EventResultField;
    return { ok: false, error: "Check the highlighted fields", field: firstField };
  }

  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured" };
  }

  const eventId = crypto.randomUUID();
  const integration = await getGoogleIntegration();
  const titleContext = await buildEventTitleContext(normalized);
  const effectiveInput = resolveEventFields(
    resolveEventLocation(resolveEventDates(resolveEventTime(normalized, titleContext)), titleContext),
    titleContext,
  );
  // Targets derive from the effective input so a type with invitees disabled
  // only ever lands in the creator's department.
  const targets = await resolveTargetCalendars(effectiveInput, null);
  if (targets.length === 0) {
    return {
      ok: false,
      error: "Assign yourself to a department or tag an invitee",
    };
  }
  const created: { googleCalendarId: string; googleEventId: string }[] = [];

  try {
    for (const target of targets) {
      const googleCalendarId = await resolveGoogleCalendarId(target);
      if (!googleCalendarId) {
        throw new Error("Calendar not found");
      }
      const event = await integration.createEvent(
        await buildGcalEventInput(googleCalendarId, effectiveInput, eventId, titleContext),
      );
      created.push({ googleCalendarId, googleEventId: event.id });
    }
  } catch (error) {
    // Roll back partial copies so a failed multi-department create never leaves
    // orphan events behind.
    for (const copy of created) {
      await integration.deleteEvent(copy.googleCalendarId, copy.googleEventId).catch(() => {});
    }
    // describeError hides raw SQL from drizzle-wrapped DB errors and keeps
    // Google API messages (see src/db/pgErrors.ts).
    return { ok: false, error: describeError(error, "Could not create the event") };
  }

  const targetCalendars = await calendarNames(targets);
  const userNames = namesById(
    await getUsersByIds([...new Set([normalized.creatorId, ...normalized.inviteeUserIds])]),
  );
  const renderedTitle = renderEventTitle({
    description: effectiveInput.title,
    eventType: titleContext.eventType,
    people: titleContext.people,
    departments: titleContext.departments,
    location: effectiveInput.location,
    template: titleContext.template,
    timeOption: effectiveInput.timeOption,
    startTime: naiveTimePart(effectiveInput.start),
    endTime: naiveTimePart(effectiveInput.end),
    startAmPm: effectiveInput.startAmPm,
    endAmPm: effectiveInput.endAmPm,
  });
  const snapshot = buildEventSnapshot({
    title: renderedTitle,
    description: effectiveInput.title,
    type: effectiveInput.eventType,
    timeParts: timePartsOf(effectiveInput),
    outOfCamp: effectiveInput.outOfCamp,
    overseas: effectiveInput.overseas,
    pinned: effectiveInput.pinned,
    location: effectiveInput.location,
    departmentIds: targets,
    inviteeUserIds: effectiveInput.inviteeUserIds,
    creatorId: effectiveInput.creatorId || null,
    names: { departmentNames: targetCalendars, userNames },
  });
  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.eventCreate,
    entityType: "calendar",
    entityId: targets[0],
    entityName: renderedTitle || "Untitled event",
    method: "createEvent",
    details: {
      ...snapshot,
      eventId,
      googleEventIds: created.map((copy) => copy.googleEventId),
    },
  });
  await dispatchEventWebhook({
    action: WEBHOOK_ACTIONS.eventCreated,
    eventId,
    googleEventIds: created.map((copy) => copy.googleEventId),
    snapshot,
    timeParts: timePartsOf(effectiveInput),
    changes: null,
    actor: webhookActorFrom(session),
    occurredAt: new Date(),
  });

  await invalidateGcalCache(
    created.map((copy) => copy.googleCalendarId),
    monthsInRange(effectiveInput.start, effectiveInput.end),
  );
  await invalidatePinnedCache();
  // Best-effort KAH breach notification (registered after the cache
  // invalidation so its month reads see the saved copies). Never blocks.
  const createdWindow = absEventRange(
    effectiveInput.start,
    effectiveInput.end,
    effectiveInput.timeOption !== "range",
  );
  dispatchKahBreachCheck({
    windowStart: createdWindow.start,
    windowEnd: createdWindow.end,
    eventTitle: renderedTitle,
    actor: actorFrom(session),
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Update every linked copy of a logical event. The target set is reconciled:
 * copies in newly-involved departments are created, existing ones updated
 * (backfilling the group id on the first edit of a legacy event), and copies in
 * departments no longer involved are deleted. The plan is idempotent, so a
 * half-failed attempt self-heals on retry.
 */
export async function updateEvent(
  ref: EventRef,
  input: EventFormValues,
): Promise<EventActionResult> {
  const session = await requireSession();
  // "On behalf of" is optional: a blank creator means the acting user (a
  // cleared select reassigns the event to the editor). Clamp before
  // validation so inverted ranges auto-correct.
  const normalized = clampEventEnd(withSelfCreator(input, session.user.id));

  const ownershipError = ownershipGuard(session, ref.creatorId);
  if (ownershipError) {
    return { ok: false, error: ownershipError };
  }

  const creatorError = creatorGuard(session, normalized.creatorId, ref.creatorId);
  if (creatorError) {
    return { ok: false, error: creatorError };
  }

  const errors = validateEventForm(normalized);
  if (Object.keys(errors).length > 0) {
    const firstField = Object.keys(errors)[0] as EventResultField;
    return { ok: false, error: "Check the highlighted fields", field: firstField };
  }

  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured" };
  }

  const eventId = ref.eventId ?? crypto.randomUUID();
  const integration = await getGoogleIntegration();
  const titleContext = await buildEventTitleContext(normalized);
  const effectiveInput = resolveEventFields(
    resolveEventLocation(resolveEventDates(resolveEventTime(normalized, titleContext)), titleContext),
    titleContext,
  );
  // Old targets come from the ref (its stored people); new targets from the
  // effective input, so a type with invitees disabled removes the other
  // departments' copies on save.
  const [oldTargets, newTargets] = await Promise.all([
    refTargetCalendars(ref),
    resolveTargetCalendars(effectiveInput, ref.calendarId),
  ]);
  // The old copies' search range covers both the old and new times (±day), so
  // a date/time change still finds the copies to update or retire.
  const range = withMargin(
    unionRange(
      absEventRange(ref.start, ref.end, ref.allDay),
      absEventRange(
        effectiveInput.start,
        effectiveInput.end,
        effectiveInput.timeOption !== "range",
      ),
    ),
  );
  const fallback = await legacyFallback(ref);

  const union = [...new Set([...oldTargets, ...newTargets])];
  const newSet = new Set(newTargets);
  const createdHere: { googleCalendarId: string; googleEventId: string }[] = [];
  const affectedGoogleIds = new Set<string>();
  // Google event ids touched by this run (updated, created, or retired) for
  // the webhook payload.
  const touchedGoogleEventIds = new Set<string>();
  // The first existing copy found anywhere is the event's pre-edit state for
  // the audit diff (all copies of a logical event are identical).
  let firstCopy: GcalEventItem | null = null;

  try {
    for (const target of union) {
      const googleCalendarId = await resolveGoogleCalendarId(target);
      if (!googleCalendarId) {
        continue;
      }
      affectedGoogleIds.add(googleCalendarId);
      const found = await findCopies(googleCalendarId, eventId, range, fallback);
      if (firstCopy === null && found.length > 0) {
        firstCopy = found[0];
      }
      if (newSet.has(target)) {
        if (found.length > 0) {
          for (const copy of found) {
            await integration.updateEvent(
              copy.id,
              await buildGcalEventInput(googleCalendarId, effectiveInput, eventId, titleContext),
            );
            touchedGoogleEventIds.add(copy.id);
          }
        } else {
          const event = await integration.createEvent(
            await buildGcalEventInput(googleCalendarId, effectiveInput, eventId, titleContext),
          );
          createdHere.push({ googleCalendarId, googleEventId: event.id });
          touchedGoogleEventIds.add(event.id);
        }
      } else {
        for (const copy of found) {
          await integration.deleteEvent(googleCalendarId, copy.id);
          touchedGoogleEventIds.add(copy.id);
        }
      }
    }
  } catch (error) {
    // Newly created copies are rolled back; pre-existing copies were already
    // updated before this point and the retry will re-derive the same plan.
    for (const copy of createdHere) {
      await integration.deleteEvent(copy.googleCalendarId, copy.googleEventId).catch(() => {});
    }
    return { ok: false, error: describeError(error, "Could not update the event") };
  }

  const names: EventSnapshotNames = {
    departmentNames: await calendarNames([...new Set([...oldTargets, ...newTargets])]),
    userNames: namesById(
      await getUsersByIds(
        [
          ...new Set([
            ...(ref.creatorId ? [ref.creatorId] : []),
            ...ref.inviteeUserIds,
            normalized.creatorId,
            ...normalized.inviteeUserIds,
          ]),
        ],
      ),
    ),
  };
  const before = snapshotFromCopy(ref, firstCopy, names, oldTargets);
  const renderedTitle = renderEventTitle({
    description: effectiveInput.title,
    eventType: titleContext.eventType,
    people: titleContext.people,
    departments: titleContext.departments,
    location: effectiveInput.location,
    template: titleContext.template,
    timeOption: effectiveInput.timeOption,
    startTime: naiveTimePart(effectiveInput.start),
    endTime: naiveTimePart(effectiveInput.end),
    startAmPm: effectiveInput.startAmPm,
    endAmPm: effectiveInput.endAmPm,
  });
  const after = buildEventSnapshot({
    title: renderedTitle,
    description: effectiveInput.title,
    type: effectiveInput.eventType,
    timeParts: timePartsOf(effectiveInput),
    outOfCamp: effectiveInput.outOfCamp,
    overseas: effectiveInput.overseas,
    pinned: effectiveInput.pinned,
    location: effectiveInput.location,
    departmentIds: newTargets,
    inviteeUserIds: effectiveInput.inviteeUserIds,
    creatorId: effectiveInput.creatorId || null,
    names,
  });
  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.eventUpdate,
    entityType: "calendar",
    entityId: newTargets[0],
    entityName: renderedTitle || "Untitled event",
    method: "updateEvent",
    details: {
      ...diffFields(before, after),
      eventId,
    },
  });
  await dispatchEventWebhook({
    action: WEBHOOK_ACTIONS.eventUpdated,
    eventId,
    googleEventIds: [...touchedGoogleEventIds],
    snapshot: after,
    timeParts: timePartsOf(effectiveInput),
    changes: diffFields(before, after).changes,
    actor: webhookActorFrom(session),
    occurredAt: new Date(),
  });

  await invalidateGcalCache(
    [...affectedGoogleIds],
    [
      ...new Set([
        ...monthsInRange(ref.start, ref.end),
        ...monthsInRange(effectiveInput.start, effectiveInput.end),
      ]),
    ],
  );
  await invalidatePinnedCache();
  // Same best-effort KAH breach check as create (deleteEvent skips it: a
  // deletion frees people and cannot push a group below its threshold).
  const updatedWindow = absEventRange(
    effectiveInput.start,
    effectiveInput.end,
    effectiveInput.timeOption !== "range",
  );
  dispatchKahBreachCheck({
    windowStart: updatedWindow.start,
    windowEnd: updatedWindow.end,
    eventTitle: renderedTitle,
    actor: actorFrom(session),
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Delete every linked copy of a logical event. */
export async function deleteEvent(ref: EventRef): Promise<EventActionResult> {
  const session = await requireSession();

  const ownershipError = ownershipGuard(session, ref.creatorId);
  if (ownershipError) {
    return { ok: false, error: ownershipError };
  }

  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured" };
  }

  const [targets, fallback] = await Promise.all([refTargetCalendars(ref), legacyFallback(ref)]);
  const integration = await getGoogleIntegration();
  const range = withMargin(absEventRange(ref.start, ref.end, ref.allDay));
  const deletedGoogleEventIds: string[] = [];
  const affectedGoogleIds = new Set<string>();
  // The first existing copy found is the event's state for the audit row.
  let firstCopy: GcalEventItem | null = null;

  try {
    for (const target of targets) {
      const googleCalendarId = await resolveGoogleCalendarId(target);
      if (!googleCalendarId) {
        continue;
      }
      affectedGoogleIds.add(googleCalendarId);
      const found = await findCopies(googleCalendarId, ref.eventId ?? "", range, fallback);
      if (firstCopy === null && found.length > 0) {
        firstCopy = found[0];
      }
      for (const copy of found) {
        await integration.deleteEvent(googleCalendarId, copy.id);
        deletedGoogleEventIds.push(copy.id);
      }
    }
  } catch (error) {
    return { ok: false, error: describeError(error, "Could not delete the event") };
  }

  const snapshot = snapshotFromCopy(
    ref,
    firstCopy,
    {
      departmentNames: await calendarNames(targets),
      userNames: namesById(
        await getUsersByIds([...new Set([...(ref.creatorId ? [ref.creatorId] : []), ...ref.inviteeUserIds])]),
      ),
    },
    targets,
  );
  await logAction({
    ...actorFrom(session),
    action: AUDIT_ACTIONS.eventDelete,
    entityType: "calendar",
    entityId: ref.calendarId,
    entityName: snapshot.title ?? "Untitled event",
    method: "deleteEvent",
    details: {
      ...snapshot,
      eventId: ref.eventId,
      googleEventIds: deletedGoogleEventIds,
    },
  });
  await dispatchEventWebhook({
    action: WEBHOOK_ACTIONS.eventDeleted,
    eventId: ref.eventId,
    googleEventIds: deletedGoogleEventIds,
    snapshot,
    timeParts: null,
    changes: null,
    actor: webhookActorFrom(session),
    occurredAt: new Date(),
  });

  await invalidateGcalCache([...affectedGoogleIds], monthsInRange(ref.start, ref.end));
  await invalidatePinnedCache();
  revalidatePath("/dashboard");
  return { ok: true };
}
