"use server";

import { describeError } from "@/db/pgErrors";
import { AUDIT_ACTIONS, actorFromSession } from "@/lib/audit/build";
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
  eventNotesFromInput,
  parseEventPeople,
  parseEventRegistrationEnabled,
  withEditLink,
  withInternalMarker,
} from "@/lib/events/notes";
import { modifyGuard, canChangeLock, registrationEditGuard } from "@/lib/events/guards";
import { dispatchKahBreachCheck } from "@/lib/kah/notify";
import { dispatchParticipantNotifications } from "@/lib/events/participantNotify/notify";
import { naiveTimePart } from "@/lib/events/timeOptions";
import { renderEventTitle } from "@/lib/events/eventTitle";
import { invalidatePinnedCache } from "@/lib/events/pinned";
import {
  applyRegistrationIntent,
  eventFormValuesFromCopy,
  isRegistrationFull,
  registrationSeatCount,
  type RegistrationIntent,
} from "@/lib/events/registration";
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
import { mapSettled, mapWithConcurrency } from "@/lib/async";
import { invalidateGcalCache } from "@/lib/google/eventsCache";
import {
  getUsersByIds,
  activeMembershipsByDepartment,
  type UserDisplayInfo,
} from "@/lib/roster/queries";
import { resolveGoogleCalendarId, resolveGoogleCalendarIds } from "@/lib/roster/shares";
import { requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { dispatchEventWebhook } from "@/lib/webhooks/deliver";
import { WEBHOOK_ACTIONS } from "@/lib/webhooks/payload";

export type EventResultField = "title" | "start" | "end" | "startAmPm" | "endAmPm";

/**
 * Max Google Calendar writes in flight for one event mutation. Department
 * copies are independent events, so they fan out under the same bound the
 * copied-event reads already use. A serial loop pays a full Google round trip
 * per copy (~0.7–1.2 s measured), which is the dominant cost of a
 * multi-department save — see tasks/responsiveness-plan.md.
 */
const GOOGLE_WRITE_CONCURRENCY = 4;

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

function buildGcalEventInput(
  googleCalendarId: string,
  /** App calendar (department) id this copy lives on — the `_eventCal` deep-link hint. */
  calendarId: string,
  input: EventFormValues,
  eventId: string,
  titleContext: EventTitleContext,
  /** Request origin, resolved once per action (see `appBaseUrl`). */
  baseUrl: string,
): GcalEventInput {
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
  const editLink = eventDetailUrl(baseUrl, input.start, eventId, calendarId);
  const block = encodeNotesBlock(encodeEventNotes(eventNotesFromInput(eventId, input)));
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

/**
 * Whether the stored copy is open for registration. This is the per-event
 * notes flag and the authoritative check used by update/delete (never the
 * client-supplied ref).
 */
async function isRegistrationEvent(copy: GcalEventItem): Promise<boolean> {
  return parseEventRegistrationEnabled(copy.description);
}

/**
 * Find one stored copy of a logical event, preferring the representative
 * calendar the client saw. Used by self-registration to rebuild the event from
 * Google rather than trusting client-supplied fields.
 */
async function findRepresentativeCopy(
  ref: EventRef,
): Promise<{ copy: GcalEventItem; calendarId: string } | null> {
  if (!ref.eventId) {
    return null;
  }
  const eventId = ref.eventId;
  const targets = await refTargetCalendars(ref);
  const ordered = [ref.calendarId, ...targets.filter((id) => id !== ref.calendarId)];
  const googleIds = await resolveGoogleCalendarIds(ordered);
  const range = withMargin(absEventRange(ref.start, ref.end, ref.allDay));
  // Probe every candidate concurrently (bounded) and pick the first hit in
  // preference order: a registration copy may live on any of the event's
  // departments, and the old serial scan paid a full Google round trip per
  // candidate that missed.
  const probes = await mapWithConcurrency(ordered, 4, async (target) => {
    const googleCalendarId = googleIds[target];
    if (!googleCalendarId) {
      return null;
    }
    const found = await findCopies(googleCalendarId, eventId, range, null);
    return found.length > 0 ? { copy: found[0], calendarId: target } : null;
  });
  return probes.find((probe) => probe !== null) ?? null;
}

/**
 * The three mutations deliberately do **not** call `revalidatePath("/dashboard")`.
 * The dashboard route is a thin client shell that renders no event data — the
 * grid comes from the client's own `/api/dashboard/load` re-read after the
 * action resolves — so forcing an RSC re-render only added a layout+page render
 * (~75 ms measured) to every save without changing what the user sees. Cache
 * invalidation remains awaited inside the action so that re-read is fresh
 * (see docs/event-mutations.md §1.9).
 */
export async function createEvent(input: EventFormValues): Promise<EventActionResult> {
  const session = await requireSession();
  // The organizer is always the acting session user — admins can no longer
  // create events on behalf of other users. Clamp end to start before
  // validation so a stale client with an inverted range auto-corrects instead
  // of surfacing "End must be on or after start".
  const normalized = clampEventEnd(resolveEventAuthor(input, session.user.id, null, true));

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
  // Registration events are the exception: they may start with zero
  // registrants (the creator's department is the fallback calendar).
  if (
    !titleContext.registrationEnabled &&
    effectiveInput.inviteeUserIds.length === 0 &&
    effectiveInput.inviteeDepartments.length === 0
  ) {
    return { ok: false, error: "Add at least one participant or department" };
  }
  // Targets derive from the effective input so a type with invitees disabled
  // only ever lands in the creator's department.
  const targets = await resolveTargetCalendars(effectiveInput, null, {
    includeCreatorDepartment: titleContext.registrationEnabled,
  });
  if (targets.length === 0) {
    return {
      ok: false,
      error: "Assign yourself to a department or tag an invitee",
    };
  }
  // Resolve every target's Google calendar id in one query and read the request
  // origin once — both are needed before the first write. The old serial loop
  // paid one id query and one `appBaseUrl()` per copy.
  let googleIds: Record<string, string>;
  let baseUrl: string;
  try {
    [googleIds, baseUrl] = await Promise.all([resolveGoogleCalendarIds(targets), appBaseUrl()]);
  } catch (error) {
    return { ok: false, error: describeError(error, "Could not create the event") };
  }
  // Names and the rendered title do not depend on the writes, so resolve them
  // while the Google calls are in flight instead of adding a serial DB tail.
  // The catch keeps a failed lookup from becoming an unhandled rejection while
  // the writes run; the snapshot below degrades its display names instead.
  const namesPromise = Promise.all([
    calendarNames(targets),
    getUsersByIds([...new Set([normalized.creatorId, ...normalized.inviteeUserIds])]),
  ]).catch(() => null);
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
  // Every target's copy is an independent Google write, so fan out under a
  // bounded concurrency (the writes are the dominant cost of a save). A serial
  // loop made a three-department create pay three Google round trips; this pays
  // one. `mapSettled` waits for every worker before the rollback so a failed
  // create can never orphan a sibling worker's copy.
  const { results, failures } = await mapSettled(
    targets,
    GOOGLE_WRITE_CONCURRENCY,
    async (target) => {
      const googleCalendarId = googleIds[target];
      if (!googleCalendarId) {
        throw new Error("Calendar not found");
      }
      const event = await integration.createEvent(
        buildGcalEventInput(
          googleCalendarId,
          target,
          effectiveInput,
          eventId,
          titleContext,
          baseUrl,
        ),
      );
      return { calendarId: target, googleCalendarId, googleEventId: event.id };
    },
  );
  if (failures.length > 0) {
    // All workers have settled by now: undo the copies this create managed to
    // write, concurrently, so a failed multi-department create leaves no orphan
    // events behind.
    const written = results.filter(
      (copy): copy is { calendarId: string; googleCalendarId: string; googleEventId: string } =>
        copy !== undefined,
    );
    await Promise.allSettled(
      written.map((copy) => integration.deleteEvent(copy.googleCalendarId, copy.googleEventId)),
    );
    // describeError hides raw SQL from drizzle-wrapped DB errors and keeps
    // Google API messages (see src/db/pgErrors.ts).
    return { ok: false, error: describeError(failures[0].error, "Could not create the event") };
  }
  const created = results.filter(
    (copy): copy is { calendarId: string; googleCalendarId: string; googleEventId: string } =>
      copy !== undefined,
  );

  // A name-lookup failure must never fail a save whose Google copies are
  // already written (the user would retry and duplicate the event); degrade the
  // audit snapshot's display names instead.
  const names = await namesPromise;
  const targetCalendars = names?.[0] ?? {};
  const userNames = namesById(names?.[1] ?? []);
  const snapshot = buildEventSnapshot({
    title: renderedTitle,
    description: effectiveInput.title,
    type: effectiveInput.eventType,
    timeParts: timePartsOf(effectiveInput),
    outOfCamp: effectiveInput.outOfCamp,
    overseas: effectiveInput.overseas,
    pinned: effectiveInput.pinned,
    registrationEnabled: effectiveInput.registrationEnabled === true,
    registrationCap: effectiveInput.registrationCap ?? null,
    location: effectiveInput.location,
    departmentIds: targets,
    inviteeUserIds: effectiveInput.inviteeUserIds,
    creatorId: effectiveInput.creatorId || null,
    names: { departmentNames: targetCalendars, userNames },
  });
  // The mutation's response-path tail: three independent writes, so run them
  // concurrently instead of paying three serial round trips. Cache invalidation
  // stays awaited — the client re-reads immediately after this action resolves
  // and must not see a pre-mutation cache row.
  await Promise.all([
    logAction({
      ...actorFromSession(session),
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
    }),
    invalidateGcalCache(
      created.map((copy) => copy.googleCalendarId),
      monthsInRange(effectiveInput.start, effectiveInput.end),
    ),
    invalidatePinnedCache(),
  ]);
  dispatchEventWebhook({
    action: WEBHOOK_ACTIONS.eventCreated,
    eventId,
    googleEventIds: created.map((copy) => copy.googleEventId),
    snapshot,
    timeParts: timePartsOf(effectiveInput),
    changes: null,
    actor: webhookActorFrom(session),
    occurredAt: new Date(),
  });

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
    allDay: effectiveInput.timeOption !== "range",
    eventTitle: renderedTitle,
    actor: actorFromSession(session),
    savedEventOverseas: effectiveInput.outOfCamp && effectiveInput.overseas,
    savedEventUserIds: effectiveInput.inviteeUserIds,
  });
  // Notify everyone newly included in this event as a participant (best-effort
  // Web Push via after(); the organizer/actor is never notified).
  const notifyActor = actorFromSession(session);
  dispatchParticipantNotifications({
    actorId: notifyActor.actorId,
    actorName: notifyActor.actorName,
    actorRole: notifyActor.actorRole,
    eventId,
    description: effectiveInput.title,
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
    baseUrl,
  });
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
  // organizer or an admin may change the owner-only lock and the per-event
  // registration flag — every other editor keeps the stored values.
  const canChangeOwnership = canChangeLock(session, ref.creatorId);
  const authorResolved = resolveEventAuthor(input, session.user.id, ref, canChangeOwnership);
  const normalized = clampEventEnd(
    canChangeOwnership
      ? authorResolved
      : {
          ...authorResolved,
          registrationEnabled: ref.registrationEnabled,
        },
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
  const titleContext = await buildEventTitleContext(normalized);
  const effectiveInput = resolveEffectiveInput(normalized, titleContext);
  // Same nobody-guard as createEvent (see its note), except registration
  // events may keep an empty roster.
  if (
    !titleContext.registrationEnabled &&
    effectiveInput.inviteeUserIds.length === 0 &&
    effectiveInput.inviteeDepartments.length === 0
  ) {
    return { ok: false, error: "Add at least one participant or department" };
  }
  return performEventUpdate({
    session,
    ref,
    normalized,
    effectiveInput,
    titleContext,
    eventId,
    method: "updateEvent",
    mode: "update",
  });
}

interface PerformEventUpdateParams {
  session: Awaited<ReturnType<typeof requireSession>>;
  ref: EventRef;
  normalized: EventFormValues;
  effectiveInput: EventFormValues;
  titleContext: EventTitleContext;
  eventId: string;
  /** Audit `method` label. */
  method: string;
  /**
   * `update` enforces the stored registration organizer-only restriction;
   * `registration` is the self-service toggle, which the caller has already
   * authorized and limited to the acting user's own participant entry.
   */
  mode: "update" | "registration";
  /** Extra flat audit context (e.g. the registration intent). */
  extraAudit?: Record<string, unknown>;
}

/**
 * Shared edit pipeline used by the normal update action and the self-service
 * registration toggle. Everything after target resolution lives here so the
 * copy reconciliation, audit, webhook, KAH check, notifications and cache
 * invalidation can never drift between the two entry points.
 */
async function performEventUpdate({
  session,
  ref,
  normalized,
  effectiveInput,
  titleContext,
  eventId,
  method,
  mode,
  extraAudit,
}: PerformEventUpdateParams): Promise<EventActionResult> {
  const integration = await getGoogleIntegration();
  // Old targets come from the ref (its stored people); new targets from the
  // effective input, so a type with invitees disabled removes the other
  // departments' copies on save. The legacy-fallback probe is independent, so
  // resolve all three together.
  const [oldTargets, newTargets, fallback] = await Promise.all([
    refTargetCalendars(ref),
    resolveTargetCalendars(effectiveInput, ref.calendarId, {
      includeCreatorDepartment: titleContext.registrationEnabled,
    }),
    legacyFallback(ref),
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

  const union = [...new Set([...oldTargets, ...newTargets])];
  const newSet = new Set(newTargets);
  // The first existing copy found anywhere is the event's pre-edit state for
  // the audit diff and the authoritative registration check.
  let firstCopy: GcalEventItem | null = null;

  // Names and the rendered title do not depend on the copy reads/writes, so
  // resolve them while the Google calls are in flight instead of adding a
  // serial DB tail. `appBaseUrl()` is resolved once here, never per copy.
  // The catch keeps a failed lookup from becoming an unhandled rejection while
  // the writes run; the snapshot below degrades its display names instead.
  const namesPromise = Promise.all([
    calendarNames(union),
    getUsersByIds([
      ...new Set([
        ...(ref.creatorId ? [ref.creatorId] : []),
        ...ref.inviteeUserIds,
        normalized.creatorId,
        ...normalized.inviteeUserIds,
      ]),
    ]),
  ]).catch(() => null);
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
  let unionGoogleIds: Record<string, string>;
  let baseUrl: string;
  let reads: { target: string; googleCalendarId: string | null; found: GcalEventItem[] }[];
  try {
    [unionGoogleIds, baseUrl] = await Promise.all([
      resolveGoogleCalendarIds(union),
      appBaseUrl(),
    ]);
    // Read each target's copies concurrently — the reads are side-effect-free,
    // so a bounded batch collapses N serial `listEvents` round trips into ~one.
    reads = await mapWithConcurrency(union, 4, async (target) => {
      const googleCalendarId = unionGoogleIds[target] ?? null;
      if (!googleCalendarId) {
        return { target, googleCalendarId: null, found: [] as GcalEventItem[] };
      }
      const found = await findCopies(googleCalendarId, eventId, range, fallback);
      return { target, googleCalendarId, found };
    });
  } catch (error) {
    return { ok: false, error: describeError(error, "Could not update the event") };
  }

  for (const { found } of reads) {
    if (firstCopy === null && found.length > 0) {
      firstCopy = found[0];
    }
  }

  // Authoritative registration restriction: a registration event may only be
  // edited by its organizer or an admin, even if a forged ref would satisfy
  // the preliminary attendee/department guard above.
  if (mode === "update" && firstCopy) {
    const people = parseEventPeople(firstCopy.description);
    if (await isRegistrationEvent(firstCopy)) {
      const registrationError = registrationEditGuard(session, people.creatorId);
      if (registrationError) {
        return { ok: false, error: registrationError };
      }
    }
    // Nobody but the organizer/admin may flip registration on an ordinary
    // event either — the stored copy, not the client ref, is authoritative.
    const storedRegistration = parseEventRegistrationEnabled(firstCopy.description);
    if (
      !canChangeLock(session, people.creatorId) &&
      (effectiveInput.registrationEnabled === true) !== storedRegistration
    ) {
      return { ok: false, error: "Only the organizer can change registration" };
    }
  }

  // Each target reconciles independently (update, create, or retire its copy),
  // so the Google writes fan out under the same bound as the reads. A serial
  // loop paid one full Google round trip per copy, which dominates a
  // multi-department edit. `mapSettled` waits for every worker to settle before
  // the rollback, so a failed worker's created copies are never missed.
  const { results, failures } = await mapSettled<
    (typeof reads)[number],
    {
      created: { googleCalendarId: string; googleEventId: string }[];
      live: EventMutationCopy[];
      touched: string[];
    }
  >(reads, GOOGLE_WRITE_CONCURRENCY, async ({ target, googleCalendarId, found }) => {
    const created: { googleCalendarId: string; googleEventId: string }[] = [];
    const live: EventMutationCopy[] = [];
    const touched: string[] = [];
    if (!googleCalendarId) {
      return { created, live, touched };
    }
    if (newSet.has(target)) {
      if (found.length > 0) {
        for (const copy of found) {
          await integration.updateEvent(
            copy.id,
            buildGcalEventInput(
              googleCalendarId,
              target,
              effectiveInput,
              eventId,
              titleContext,
              baseUrl,
            ),
          );
          touched.push(copy.id);
          live.push({ calendarId: target, googleEventId: copy.id });
        }
      } else {
        const event = await integration.createEvent(
          buildGcalEventInput(
            googleCalendarId,
            target,
            effectiveInput,
            eventId,
            titleContext,
            baseUrl,
          ),
        );
        created.push({ googleCalendarId, googleEventId: event.id });
        live.push({ calendarId: target, googleEventId: event.id });
        touched.push(event.id);
      }
    } else {
      for (const copy of found) {
        await integration.deleteEvent(googleCalendarId, copy.id);
        touched.push(copy.id);
      }
    }
    return { created, live, touched };
  });

  if (failures.length > 0) {
    // Newly created copies are rolled back; pre-existing copies were already
    // updated before this point and the retry will re-derive the same plan.
    const createdHere = results.flatMap((result) => result?.created ?? []);
    await Promise.allSettled(
      createdHere.map((copy) => integration.deleteEvent(copy.googleCalendarId, copy.googleEventId)),
    );
    return { ok: false, error: describeError(failures[0].error, "Could not update the event") };
  }
  // Copies that survive the edit (updated in place or created) — returned with
  // the success result so the client can pin its optimistic chip's Google ids.
  // Results are slot-per-read, so the order follows `union`.
  const liveCopies = results.flatMap((result) => result?.live ?? []);
  // Google event ids touched by this run (updated, created, or retired) for
  // the webhook payload.
  const touchedGoogleEventIds = new Set(results.flatMap((result) => result?.touched ?? []));
  const affectedGoogleIds = new Set(
    reads.flatMap((read) => (read.googleCalendarId ? [read.googleCalendarId] : [])),
  );

  // A name-lookup failure must never fail a save whose copies are already
  // written (the user would retry and duplicate the event); degrade the audit
  // snapshot's display names instead.
  const namesResult = await namesPromise;
  const names: EventSnapshotNames = {
    departmentNames: namesResult?.[0] ?? {},
    userNames: namesById(namesResult?.[1] ?? []),
  };
  const before = snapshotFromCopy(ref, firstCopy, names, oldTargets);
  const after = buildEventSnapshot({
    title: renderedTitle,
    description: effectiveInput.title,
    type: effectiveInput.eventType,
    timeParts: timePartsOf(effectiveInput),
    outOfCamp: effectiveInput.outOfCamp,
    overseas: effectiveInput.overseas,
    pinned: effectiveInput.pinned,
    registrationEnabled: effectiveInput.registrationEnabled === true,
    registrationCap: effectiveInput.registrationCap ?? null,
    location: effectiveInput.location,
    departmentIds: newTargets,
    inviteeUserIds: effectiveInput.inviteeUserIds,
    creatorId: effectiveInput.creatorId || null,
    names,
  });
  // Independent writes on the response path: run them concurrently instead of
  // paying three serial round trips. Cache invalidation stays awaited — the
  // client re-reads immediately after this action resolves and must not see a
  // pre-mutation cache row.
  await Promise.all([
    logAction({
      ...actorFromSession(session),
      action: AUDIT_ACTIONS.eventUpdate,
      entityType: "calendar",
      entityId: newTargets[0] ?? ref.calendarId,
      entityName: renderedTitle || "Untitled event",
      method,
      details: {
        ...diffFields(before, after),
        eventId,
        ...(extraAudit ?? {}),
      },
    }),
    invalidateGcalCache(
      [...affectedGoogleIds],
      [
        ...new Set([
          ...monthsInRange(ref.start, ref.end),
          ...monthsInRange(effectiveInput.start, effectiveInput.end),
        ]),
      ],
    ),
    invalidatePinnedCache(),
  ]);
  dispatchEventWebhook({
    action: WEBHOOK_ACTIONS.eventUpdated,
    eventId,
    googleEventIds: [...touchedGoogleEventIds],
    snapshot: after,
    timeParts: timePartsOf(effectiveInput),
    changes: diffFields(before, after).changes,
    actor: webhookActorFrom(session),
    occurredAt: new Date(),
  });

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
    allDay: effectiveInput.timeOption !== "range",
    eventTitle: renderedTitle,
    actor: actorFromSession(session),
    savedEventOverseas: effectiveInput.outOfCamp && effectiveInput.overseas,
    savedEventUserIds: effectiveInput.inviteeUserIds,
  });
  // Notify users newly added as participants by this edit (best-effort Web Push
  // via after(); never the acting user). A no-op participant change resolves to
  // an empty added set inside the dispatch and sends nothing.
  const notifyActor = actorFromSession(session);
  dispatchParticipantNotifications({
    actorId: notifyActor.actorId,
    actorName: notifyActor.actorName,
    actorRole: notifyActor.actorRole,
    eventId,
    description: effectiveInput.title,
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
    baseUrl,
  });
  return { ok: true, eventId, copies: liveCopies };
}

/**
 * Self-service registration for a registration-enabled event. Only the acting
 * user's own participant entry is toggled; every other field comes from the
 * stored Google copy, never from the client. The shared update pipeline then
 * reconciles department copies, re-renders the title, and records the change.
 */
export async function setEventRegistration(
  ref: EventRef,
  intent: RegistrationIntent,
): Promise<EventActionResult> {
  const session = await requireSession();
  if (intent !== "register" && intent !== "deregister") {
    return { ok: false, error: "Invalid registration action" };
  }
  if (!isUuid(session.user.id)) {
    return { ok: false, error: "Registration is only available for roster users" };
  }
  if (!ref.eventId) {
    return { ok: false, error: "This event is not open for registration" };
  }

  if (!googleCalendarConfigured()) {
    return { ok: false, error: "Google Calendar is not configured" };
  }

  try {
    const found = await findRepresentativeCopy(ref);
    if (!found || !(await isRegistrationEvent(found.copy))) {
      return { ok: false, error: "This event is not open for registration" };
    }
    const values = eventFormValuesFromCopy(found.copy);
    if (!values || !values.creatorId) {
      return { ok: false, error: "This event is not open for registration" };
    }

    const nextInvitees = applyRegistrationIntent(values.inviteeUserIds, session.user.id, intent);
    const unchanged =
      nextInvitees.length === values.inviteeUserIds.length &&
      nextInvitees.every((id, index) => id === values.inviteeUserIds[index]);
    if (unchanged) {
      return { ok: true, eventId: ref.eventId, copies: [] };
    }
    if (
      intent === "register" &&
      isRegistrationFull(values.inviteeUserIds, values.registrationCap, session.user.id)
    ) {
      return {
        ok: false,
        error: `This event is full (${registrationSeatCount(values.inviteeUserIds)} / ${values.registrationCap}).`,
      };
    }

    const normalized = clampEventEnd({
      ...values,
      inviteeUserIds: nextInvitees,
      // Preserve the stored organizer/lock exactly; self-registration never
      // adopts the acting user as organizer. Registration is already verified
      // on the stored copy, so keep it on through the shared write path.
      creatorId: values.creatorId,
      ownerOnlyEdits: values.ownerOnlyEdits,
      registrationEnabled: true,
    });
    const errors = validateEventForm(normalized);
    if (Object.keys(errors).length > 0) {
      return { ok: false, error: "This event cannot be updated" };
    }

    const titleContext = await buildEventTitleContext(normalized);
    const effectiveInput = resolveEffectiveInput(normalized, titleContext);
    if (intent === "register" && !effectiveInput.inviteeUserIds.includes(session.user.id)) {
      return { ok: false, error: "This event is not open for registration" };
    }

    // The stored copy is authoritative for target reconciliation and the audit
    // before-state, so pass the copy's people rather than the client ref's.
    const storedRef: EventRef = {
      calendarId: found.calendarId,
      googleEventId: found.copy.id,
      eventId: ref.eventId,
      start: values.start,
      end: values.end,
      allDay: found.copy.allDay,
      creatorId: values.creatorId,
      inviteeUserIds: values.inviteeUserIds,
      inviteeDepartmentIds: values.inviteeDepartments,
      ownerOnlyEdits: values.ownerOnlyEdits,
      registrationEnabled: true,
    };
    return performEventUpdate({
      session,
      ref: storedRef,
      normalized,
      effectiveInput,
      titleContext,
      eventId: ref.eventId,
      method: "setEventRegistration",
      mode: "registration",
      extraAudit: {
        registration: intent === "register" ? "Registered" : "Deregistered",
      },
    });
  } catch (error) {
    return { ok: false, error: describeError(error, "Could not update registration") };
  }
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

  const [targets, fallback, integration] = await Promise.all([
    refTargetCalendars(ref),
    legacyFallback(ref),
    getGoogleIntegration(),
  ]);
  const range = withMargin(absEventRange(ref.start, ref.end, ref.allDay));
  // The first existing copy found is the event's state for the audit row.
  let firstCopy: GcalEventItem | null = null;
  // Names for the audit snapshot are independent of the Google deletes: start
  // them before the reads/deletes and await them only for the audit row. The
  // catch keeps a failed lookup from becoming an unhandled rejection while the
  // deletes run.
  const namesPromise = Promise.all([
    calendarNames(targets),
    getUsersByIds([
      ...new Set([...(ref.creatorId ? [ref.creatorId] : []), ...ref.inviteeUserIds]),
    ]),
  ]).catch(() => null);

  // Read every target's copies concurrently (side-effect-free), then delete the
  // copies concurrently too — each delete is an independent Google call, and a
  // serial loop paid one full round trip per copy.
  let reads: { target: string; googleCalendarId: string | null; found: GcalEventItem[] }[];
  try {
    const targetGoogleIds = await resolveGoogleCalendarIds(targets);
    reads = await mapWithConcurrency(targets, 4, async (target) => {
      const googleCalendarId = targetGoogleIds[target] ?? null;
      if (!googleCalendarId) {
        return { target, googleCalendarId: null, found: [] as GcalEventItem[] };
      }
      const found = await findCopies(googleCalendarId, ref.eventId ?? "", range, fallback);
      return { target, googleCalendarId, found };
    });
  } catch (error) {
    return { ok: false, error: describeError(error, "Could not delete the event") };
  }

  for (const { found } of reads) {
    if (firstCopy === null && found.length > 0) {
      firstCopy = found[0];
    }
  }

  // Registration events are organizer/admin-only; enforce it against the
  // stored copy before any delete runs.
  if (firstCopy && (await isRegistrationEvent(firstCopy))) {
    const people = parseEventPeople(firstCopy.description);
    const registrationError = registrationEditGuard(session, people.creatorId);
    if (registrationError) {
      return { ok: false, error: registrationError };
    }
  }

  const { results, failures } = await mapSettled<
    (typeof reads)[number],
    { deleted: EventMutationCopy[]; touched: string[] }
  >(reads, GOOGLE_WRITE_CONCURRENCY, async ({ target, googleCalendarId, found }) => {
    const deleted: EventMutationCopy[] = [];
    const touched: string[] = [];
    if (!googleCalendarId) {
      return { deleted, touched };
    }
    for (const copy of found) {
      await integration.deleteEvent(googleCalendarId, copy.id);
      touched.push(copy.id);
      deleted.push({ calendarId: target, googleEventId: copy.id });
    }
    return { deleted, touched };
  });
  if (failures.length > 0) {
    return { ok: false, error: describeError(failures[0].error, "Could not delete the event") };
  }
  const deletedCopies = results.flatMap((result) => result?.deleted ?? []);
  const deletedGoogleEventIds = deletedCopies.map((copy) => copy.googleEventId);
  const affectedGoogleIds = new Set(
    reads.flatMap((read) => (read.googleCalendarId ? [read.googleCalendarId] : [])),
  );

  // A name-lookup failure must not fail the delete (the copies are already
  // gone); degrade the audit snapshot's display names instead.
  const namesResult = await namesPromise;
  const snapshot = snapshotFromCopy(
    ref,
    firstCopy,
    {
      departmentNames: namesResult?.[0] ?? {},
      userNames: namesById(namesResult?.[1] ?? []),
    },
    targets,
  );
  // Independent writes on the response path: run them concurrently instead of
  // paying three serial round trips. Cache invalidation stays awaited so the
  // client's post-delete re-read cannot race a pre-delete cache row.
  await Promise.all([
    logAction({
      ...actorFromSession(session),
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
    }),
    invalidateGcalCache([...affectedGoogleIds], monthsInRange(ref.start, ref.end)),
    invalidatePinnedCache(),
  ]);
  dispatchEventWebhook({
    action: WEBHOOK_ACTIONS.eventDeleted,
    eventId: ref.eventId,
    googleEventIds: deletedGoogleEventIds,
    snapshot,
    timeParts: null,
    changes: null,
    actor: webhookActorFrom(session),
    occurredAt: new Date(),
  });
  return { ok: true, eventId: ref.eventId, copies: deletedCopies };
}
