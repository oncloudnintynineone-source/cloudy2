"use server";

import { revalidatePath } from "next/cache";

import { describeError } from "@/db/pgErrors";
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
import { modifyGuard, canChangeLock } from "@/lib/events/guards";
import { dispatchKahBreachCheck } from "@/lib/kah/notify";
import { dispatchParticipantNotifications } from "@/lib/events/participantNotify/notify";
import { naiveTimePart } from "@/lib/events/timeOptions";
import { renderEventTitle } from "@/lib/events/eventTitle";
import { invalidatePinnedCache } from "@/lib/events/pinned";
import {
  buildEventTitleContext,
  calendarNames,
  refTargetCalendars,
  resolveEffectiveInput,
  resolveTargetCalendars,
  type EventTitleContext,
} from "@/lib/events/writeContext";
import type { EventRef } from "@/lib/events/targets";
import {
  clampEventEnd,
  resolveEventAuthor,
  validateEventForm,
  type EventFormValues,
} from "@/lib/events/validate";
import {
  getGoogleIntegration,
  googleCalendarConfigured,
  type GcalEventInput,
  type GcalEventItem,
} from "@/lib/google";
import { invalidateGcalCache } from "@/lib/google/eventsCache";
import { getUsersByIds, activeMembershipsByDepartment, type UserDisplayInfo } from "@/lib/roster/queries";
import { resolveGoogleCalendarId } from "@/lib/roster/shares";
import { requireSession } from "@/lib/session";
import { dispatchEventWebhook } from "@/lib/webhooks/deliver";
import { WEBHOOK_ACTIONS } from "@/lib/webhooks/payload";

export type EventResultField = "title" | "start" | "end" | "startAmPm" | "endAmPm";

/**
 * One copy written (or retired) by an event mutation, keyed by its app-side
 * registry calendar (department) id. Success results carry the copies so the
 * dashboard's optimistic UI can pin its stand-in chip to the authoritative
 * Google ids as soon as the action resolves (see docs/optimistic-mutations.md).
 */
export interface EventMutationCopy {
  /** App registry calendar (department) id the copy lives on. */
  calendarId: string;
  googleEventId: string;
}

/**
 * Result of an event create/update/delete. On success the mutation reports the
 * logical event's group id (`eventId`, null only for a legacy delete that had
 * none) plus the per-copy ids it wrote/retired, so the client never needs a
 * second fetch just to identify what changed.
 */
export type EventActionResult =
  | { ok: true; eventId: string | null; copies: EventMutationCopy[] }
  | { ok: false; error: string; field?: EventResultField };

/** The narrowed success arm of {@link EventActionResult}. */
export type EventActionOk = Extract<EventActionResult, { ok: true }>;

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

async function buildGcalEventInput(
  googleCalendarId: string,
  /** App calendar (department) id this copy lives on — the `_eventCal` deep-link hint. */
  calendarId: string,
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
    recipe: titleContext.recipe,
    timeOption: input.timeOption,
    startTime: naiveTimePart(input.start),
    endTime: naiveTimePart(input.end),
    startAmPm: input.startAmPm,
    endAmPm: input.endAmPm,
  });
  // The notes carry an "Edit:" link (shown on top of the opaque block) that
  // opens this event's details modal in the app (Edit lives inside it); it is
  // rebuilt on every create/edit so the embedded date stays current for
  // in-app reschedules. `_eventCal` names this copy's calendar so the fetch
  // includes it even when the arriving user's filters exclude it.
  const editLink = eventDetailUrl(await appBaseUrl(), input.start, eventId, calendarId);
  const block = encodeNotesBlock(
    encodeEventNotes({
      eventId,
      eventType: input.eventType || undefined,
      createdBy: input.creatorId || undefined,
      inviteeUsers: input.inviteeUserIds,
      inviteeDepartments: input.inviteeDepartments,
      ownerOnlyEdits: input.ownerOnlyEdits || undefined,
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
  const description = withInternalMarker(withEditLink(block, editLink));

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

export async function createEvent(input: EventFormValues): Promise<EventActionResult> {
  const session = await requireSession();
  // The organizer is always the acting session user — admins can no longer
  // create events on behalf of other users. Clamp end to start before
  // validation so a stale client with an inverted range auto-corrects instead
  // of surfacing "End must be on or after start".
  const normalized = clampEventEnd(
    resolveEventAuthor(input, session.user.id, null, true),
  );

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
  const effectiveInput = resolveEffectiveInput(normalized, titleContext);
  // Every event must occupy someone: after field resolution a type with
  // invitees disabled always carries the organizer as its sole attendee, so
  // an empty result means the actor tagged no people and no departments.
  if (
    effectiveInput.inviteeUserIds.length === 0 &&
    effectiveInput.inviteeDepartments.length === 0
  ) {
    return { ok: false, error: "Add at least one participant or department" };
  }
  // Targets derive from the effective input so a type with invitees disabled
  // only ever lands in the creator's department.
  const targets = await resolveTargetCalendars(effectiveInput, null);
  if (targets.length === 0) {
    return {
      ok: false,
      error: "Assign yourself to a department or tag an invitee",
    };
  }
  const created: { calendarId: string; googleCalendarId: string; googleEventId: string }[] = [];

  try {
    for (const target of targets) {
      const googleCalendarId = await resolveGoogleCalendarId(target);
      if (!googleCalendarId) {
        throw new Error("Calendar not found");
      }
      const event = await integration.createEvent(
        await buildGcalEventInput(googleCalendarId, target, effectiveInput, eventId, titleContext),
      );
      created.push({ calendarId: target, googleCalendarId, googleEventId: event.id });
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
    recipe: titleContext.recipe,
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
  // Notify everyone newly included in this event as a participant (best-effort
  // Web Push via after(); the organizer/actor is never notified).
  const notifyActor = actorFrom(session);
  dispatchParticipantNotifications({
    actorId: notifyActor.actorId,
    actorName: notifyActor.actorName,
    actorRole: notifyActor.actorRole,
    eventId,
    title: renderedTitle,
    eventType: effectiveInput.eventType,
    location: effectiveInput.location,
    timeParts: timePartsOf(effectiveInput),
    reason: "created",
    before: null,
    after: {
      inviteeUserIds: effectiveInput.inviteeUserIds,
      inviteeDepartments: effectiveInput.inviteeDepartments,
    },
    copies: created.map(({ calendarId, googleEventId }) => ({ calendarId, googleEventId })),
    baseUrl: await appBaseUrl(),
  });
  revalidatePath("/dashboard");
  return {
    ok: true,
    eventId,
    copies: created.map(({ calendarId, googleEventId }) => ({ calendarId, googleEventId })),
  };
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
  // Editing is open to the organizer, tagged attendees, and active members of
  // the event's tagged departments — unless the organizer locked the event to
  // themselves (admins bypass everything). Membership resolves against the
  // *current* active roster over the departments the event is tagged on.
  const memberships = await activeMembershipsByDepartment(ref.inviteeDepartmentIds);
  const guardError = modifyGuard(
    session,
    {
      creatorId: ref.creatorId,
      inviteeUserIds: ref.inviteeUserIds,
      inviteeDepartmentIds: ref.inviteeDepartmentIds,
      ownerOnlyEdits: ref.ownerOnlyEdits,
    },
    memberships,
  );
  if (guardError) {
    return { ok: false, error: guardError };
  }
  // The organizer is fixed: an edit keeps the stored organizer (adopting the
  // acting user on a creator-less legacy/external first edit). Only the
  // organizer or an admin may change the owner-only lock — every other editor
  // keeps the stored value.
  const normalized = clampEventEnd(
    resolveEventAuthor(input, session.user.id, ref, canChangeLock(session, ref.creatorId)),
  );

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
  const effectiveInput = resolveEffectiveInput(normalized, titleContext);
  // Same nobody-guard as createEvent (see its note): the resolved attendees
  // must not be empty, or the saved copies would occupy no one.
  if (
    effectiveInput.inviteeUserIds.length === 0 &&
    effectiveInput.inviteeDepartments.length === 0
  ) {
    return { ok: false, error: "Add at least one participant or department" };
  }
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
  // Copies that survive the edit (updated in place or created) — returned with
  // the success result so the client can pin its optimistic chip's Google ids.
  const liveCopies: EventMutationCopy[] = [];
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
              await buildGcalEventInput(
                googleCalendarId,
                target,
                effectiveInput,
                eventId,
                titleContext,
              ),
            );
            touchedGoogleEventIds.add(copy.id);
            liveCopies.push({ calendarId: target, googleEventId: copy.id });
          }
        } else {
          const event = await integration.createEvent(
            await buildGcalEventInput(
              googleCalendarId,
              target,
              effectiveInput,
              eventId,
              titleContext,
            ),
          );
          createdHere.push({ googleCalendarId, googleEventId: event.id });
          liveCopies.push({ calendarId: target, googleEventId: event.id });
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
      await getUsersByIds([
        ...new Set([
          ...(ref.creatorId ? [ref.creatorId] : []),
          ...ref.inviteeUserIds,
          normalized.creatorId,
          ...normalized.inviteeUserIds,
        ]),
      ]),
    ),
  };
  const before = snapshotFromCopy(ref, firstCopy, names, oldTargets);
  const renderedTitle = renderEventTitle({
    description: effectiveInput.title,
    eventType: titleContext.eventType,
    people: titleContext.people,
    departments: titleContext.departments,
    location: effectiveInput.location,
    recipe: titleContext.recipe,
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
  // Notify users newly added as participants by this edit (best-effort Web Push
  // via after(); never the acting user). A no-op participant change resolves to
  // an empty added set inside the dispatch and sends nothing.
  const notifyActor = actorFrom(session);
  dispatchParticipantNotifications({
    actorId: notifyActor.actorId,
    actorName: notifyActor.actorName,
    actorRole: notifyActor.actorRole,
    eventId,
    title: renderedTitle,
    eventType: effectiveInput.eventType,
    location: effectiveInput.location,
    timeParts: timePartsOf(effectiveInput),
    reason: "added",
    before: {
      inviteeUserIds: ref.inviteeUserIds,
      inviteeDepartments: ref.inviteeDepartmentIds,
    },
    after: {
      inviteeUserIds: effectiveInput.inviteeUserIds,
      inviteeDepartments: effectiveInput.inviteeDepartments,
    },
    copies: liveCopies,
    baseUrl: await appBaseUrl(),
  });
  revalidatePath("/dashboard");
  return { ok: true, eventId, copies: liveCopies };
}

/** Delete every linked copy of a logical event. */
export async function deleteEvent(ref: EventRef): Promise<EventActionResult> {
  const session = await requireSession();
  // Same modification guard as updateEvent: organizer / attendees / active
  // members of tagged departments, blocked by the owner-only lock, admins
  // always pass, creator-less people-less (external) events are admin-only.
  const memberships = await activeMembershipsByDepartment(ref.inviteeDepartmentIds);
  const guardError = modifyGuard(
    session,
    {
      creatorId: ref.creatorId,
      inviteeUserIds: ref.inviteeUserIds,
      inviteeDepartmentIds: ref.inviteeDepartmentIds,
      ownerOnlyEdits: ref.ownerOnlyEdits,
    },
    memberships,
  );
  if (guardError) {
    return { ok: false, error: guardError };
  }

  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured" };
  }

  const [targets, fallback] = await Promise.all([refTargetCalendars(ref), legacyFallback(ref)]);
  const integration = await getGoogleIntegration();
  const range = withMargin(absEventRange(ref.start, ref.end, ref.allDay));
  const deletedGoogleEventIds: string[] = [];
  const deletedCopies: EventMutationCopy[] = [];
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
        deletedCopies.push({ calendarId: target, googleEventId: copy.id });
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
        await getUsersByIds([
          ...new Set([...(ref.creatorId ? [ref.creatorId] : []), ...ref.inviteeUserIds]),
        ]),
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
  return { ok: true, eventId: ref.eventId, copies: deletedCopies };
}
