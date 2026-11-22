"use server";

import { describeError } from "@/db/pgErrors";
import { AUDIT_ACTIONS, actorFromSession } from "@/lib/audit/build";
import { diffFields } from "@/lib/audit/diff";
import { logAction } from "@/lib/audit/log";
import { appBaseUrl } from "@/lib/appUrl";
import {
  absEventRange,
  addDays,
  formatInstantToNaive,
  lastDayOfMonth,
  monthsInRange,
  parseNaiveToInstant,
  shiftMonth,
  subOneDay,
  utcToDateString,
} from "@/lib/events/datetime";
import { normalizeOriginalStartTime } from "@/lib/events/occurrence";
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
  parseEventNotes,
  parseEventPeople,
  parseEventOwnerOnlyEdits,
  parseEventRecurrence,
  parseEventRegistrationCap,
  parseEventRegistrationEnabled,
  rewriteEventNotes,
  withEditLink,
  withInternalMarker,
  type EventNotes,
} from "@/lib/events/notes";
import {
  EXCEPTION_SCAN_HORIZON_YEARS,
  lastOccurrence,
  normalizeRecurrence,
  occurrenceIndex,
  occurrencesInRange,
  parseRRule,
  recurrenceSummary,
  recurrenceToRRule,
  remainingRecurrence,
  type RecurrenceRule,
} from "@/lib/events/recurrence";
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
import { invalidateGcalCache, invalidateGcalCalendarCache } from "@/lib/google/eventsCache";
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
 * Which slice of a repeating series a mutation applies to. Non-recurring
 * events omit it entirely.
 */
export type EventMutationScope = "single" | "following" | "series";

/**
 * Result of an event create/update/delete. On success the mutation reports the
 * logical event's group id (`eventId`, null only for a legacy delete that had
 * none) plus the per-copy ids it wrote/retired, so the client never needs a
 * second fetch just to identify what changed. A "this and following" split
 * additionally reports the successor series id.
 */
export type EventActionResult =
  | {
      ok: true;
      eventId: string | null;
      copies: EventMutationCopy[];
      scope?: EventMutationScope;
      successorEventId?: string | null;
    }
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

/**
 * The KAH check window for a saved event: the event's own window for a one-off,
 * or the union of a repeating series' occurrences that fall in the KAH
 * look-ahead (today through the end of next month). Null means the series has
 * no occurrence in the look-ahead, so the causal check must be skipped.
 */
function recurringKahWindow(
  rule: RecurrenceRule | null | undefined,
  startNaive: string,
  base: AbsRange,
  allDay: boolean,
): AbsRange | null {
  if (!rule) {
    return base;
  }
  const now = new Date();
  const nowNaive = formatInstantToNaive(now);
  const nextMonth = shiftMonth(nowNaive.slice(0, 7), 1);
  const windowEnd = parseNaiveToInstant(`${lastDayOfMonth(nextMonth)} 23:59:59`);
  const occurrences = occurrencesInRange(rule, startNaive, now, windowEnd, 100);
  if (occurrences.length === 0) {
    return null;
  }
  const spanMs = Math.max(0, base.end.getTime() - base.start.getTime());
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const occurrence of occurrences) {
    const occurrenceStart = absEventRange(occurrence, occurrence, allDay).start.getTime();
    start = Math.min(start, occurrenceStart);
    end = Math.max(end, occurrenceStart + spanMs);
  }
  return { start: new Date(start), end: new Date(end) };
}

interface BuildGcalOptions {
  /** Rule to mirror in the notes (defaults to `input.recurrence`). */
  recurrence?: RecurrenceRule | null;
  /** Write the rule to Google's recurrence field (false for exceptions). */
  writeRecurrence?: boolean;
  /** Mark the notes as a single-occurrence exception. */
  override?: boolean;
  /** Extra notes fields (split lineage). */
  extraNotes?: Partial<EventNotes>;
  /** Force the SGT timezone on a timed exception even without a local rule. */
  timedSeries?: boolean;
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
  options?: BuildGcalOptions,
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
  const recurrence = options?.recurrence !== undefined ? options.recurrence : input.recurrence;
  const block = encodeNotesBlock(
    encodeEventNotes(
      eventNotesFromInput(
        eventId,
        { ...input, recurrence: recurrence ?? null },
        { override: options?.override, extraNotes: options?.extraNotes },
      ),
    ),
  );
  // The marker line at the bottom flags the event as created in the app, so
  // externally created (Google-only) events can be told apart on read.
  const description = withInternalMarker(withEditLink(block, editLink));

  const allDay = input.timeOption !== "range";
  const { start, end } = absEventRange(input.start, input.end, allDay);
  const writeRecurrence = options?.writeRecurrence !== false && recurrence != null;
  const timedSeries = writeRecurrence || options?.timedSeries === true;
  return {
    calendarId: googleCalendarId,
    title,
    description,
    allDay,
    location: input.location,
    start,
    end,
    ...(writeRecurrence
      ? { recurrence: [recurrenceToRRule(recurrence, input.start, allDay)] }
      : {}),
    ...(!allDay && timedSeries ? { timeZone: "Asia/Singapore" } : {}),
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
  options?: { parents?: boolean },
): Promise<GcalEventItem[]> {
  const integration = await getGoogleIntegration();
  const items = await integration.listEvents(googleCalendarId, range.start, range.end, {
    singleEvents: options?.parents !== true,
  });
  return items.filter((item) => {
    // A parent-mode read also returns stored exceptions; only the series
    // parent (no `recurringEventId`) is the write target for a series edit.
    if (options?.parents === true && item.recurringEventId) {
      return false;
    }
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
  // A registration action fired from an occurrence must target the series
  // parent: the roster is a series-level property.
  if (ref.recurringEventId) {
    const resolved = await resolveParentRef(ref);
    return resolved ? { copy: resolved.parent, calendarId: resolved.ref.calendarId } : null;
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
  let normalized = clampEventEnd(resolveEventAuthor(input, session.user.id, null, true));

  const errors = validateEventForm(normalized);
  if (Object.keys(errors).length > 0) {
    const firstField = Object.keys(errors)[0] as EventResultField;
    return { ok: false, error: "Check the highlighted fields", field: firstField };
  }
  // The server re-normalizes the rule (stale/tampered payloads), then every
  // subsequent step (notes, RRULE, audit, KAH look-ahead) sees the same object.
  normalized = { ...normalized, recurrence: normalizeRecurrence(normalized.recurrence, normalized.start) };

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
    repeats: effectiveInput.recurrence
      ? recurrenceSummary(effectiveInput.recurrence, effectiveInput.start)
      : null,
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
    effectiveInput.recurrence
      ? invalidateGcalCalendarCache(created.map((copy) => copy.googleCalendarId))
      : invalidateGcalCache(
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
  const createdKahWindow = recurringKahWindow(
    effectiveInput.recurrence,
    effectiveInput.start,
    createdWindow,
    effectiveInput.timeOption !== "range",
  );
  if (createdKahWindow) {
    dispatchKahBreachCheck({
      windowStart: createdKahWindow.start,
      windowEnd: createdKahWindow.end,
      allDay: effectiveInput.timeOption !== "range",
      eventTitle: renderedTitle,
      actor: actorFromSession(session),
      savedEventOverseas: effectiveInput.outOfCamp && effectiveInput.overseas,
      savedEventUserIds: effectiveInput.inviteeUserIds,
    });
  }
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
  scope?: EventMutationScope,
): Promise<EventActionResult> {
  const session = await requireSession();
  // A client-supplied ref must never silently apply an edit to the wrong slice
  // of a series: an instance ref needs an explicit scope.
  if (ref.recurringEventId && !scope) {
    return { ok: false, error: "Choose what to edit for this repeating event" };
  }
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
  let normalized = clampEventEnd(
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

  // "This event" and "this and following" both start from an occurrence; the
  // series range confirms the stored rule/participants authoritatively.
  if (scope === "single" || scope === "following") {
    return scope === "single"
      ? performSingleOccurrenceUpdate(session, ref, normalized)
      : performFollowingUpdate(session, ref, normalized);
  }

  // Series scope: resolve the parent so a client that only held an instance
  // still edits the whole series (and a forged ref never updates an instance
  // as if it were a parent).
  let seriesRef = ref;
  if (ref.recurringEventId) {
    const resolved = await resolveParentRef(ref);
    if (!resolved) {
      return { ok: false, error: "Could not find the repeating series" };
    }
    if (!resolved.ref.eventId && scope === "series") {
      return {
        ok: false,
        error: "This repeating series was created outside the app; edit this occurrence only",
      };
    }
    const storedGuardError = await verifyStoredGuard(session, resolved.ref);
    if (storedGuardError) {
      return { ok: false, error: storedGuardError };
    }
    seriesRef = resolved.ref;
  }
  // Registration events are series-edited only; a single/following scope was
  // rejected above by their own entry points.
  normalized = {
    ...normalized,
    recurrence: normalizeRecurrence(normalized.recurrence, normalized.start),
  };
  const eventId = seriesRef.eventId ?? crypto.randomUUID();
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
    ref: seriesRef,
    normalized,
    effectiveInput,
    titleContext,
    eventId,
    method: "updateEvent",
    mode: "update",
    scope,
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
  /** Which slice of a repeating series this update applies to. */
  scope?: EventMutationScope;
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
  scope,
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
      const found = await findCopies(googleCalendarId, eventId, range, fallback, {
        parents: true,
      });
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

  // A pattern or registration-policy change on "All events" resets the
  // individually edited occurrences: their slots/rosters no longer align with
  // the series. The cleanup is best-effort — the parent update itself is
  // idempotent.
  if (scope === "series" && firstCopy) {
    const oldRule =
      parseEventRecurrence(firstCopy.description) ?? parseRRule(firstCopy.recurrence).rule;
    const registrationChanged =
      parseEventRegistrationEnabled(firstCopy.description) !==
        (effectiveInput.registrationEnabled === true) ||
      parseEventRegistrationCap(firstCopy.description) !==
        (effectiveInput.registrationCap ?? null);
    const patternChanged =
      ref.start !== effectiveInput.start ||
      ref.end !== effectiveInput.end ||
      registrationChanged ||
      !sameRecurrence(oldRule, effectiveInput.recurrence ?? null);
    if (patternChanged) {
      const finiteEnd = effectiveInput.recurrence
        ? lastOccurrence(effectiveInput.recurrence, effectiveInput.start)
        : null;
      const horizonEnd =
        finiteEnd?.slice(0, 10) ??
        addDays(effectiveInput.start.slice(0, 10), 365 * EXCEPTION_SCAN_HORIZON_YEARS);
      await Promise.all(
        reads.map(async (read) => {
          if (!read.googleCalendarId) {
            return;
          }
          for (const parent of read.found) {
            const exceptions = await listSeriesExceptions({
              googleCalendarId: read.googleCalendarId,
              parentId: parent.id,
              fromNaive: effectiveInput.start,
              toNaive: horizonEnd,
            }).catch(() => []);
            await Promise.allSettled(
              exceptions.map((exception) =>
                integration.deleteEvent(read.googleCalendarId!, exception.id),
              ),
            );
          }
        }),
      );
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
              {
                recurrence: effectiveInput.recurrence ?? null,
                writeRecurrence: true,
                timedSeries: Boolean(effectiveInput.recurrence),
              },
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
            {
              recurrence: effectiveInput.recurrence ?? null,
              writeRecurrence: true,
              timedSeries: Boolean(effectiveInput.recurrence),
            },
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
    repeats: effectiveInput.recurrence
      ? recurrenceSummary(effectiveInput.recurrence, effectiveInput.start)
      : null,
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
        ...(scope === "series" ? { seriesScope: "All events" } : {}),
        ...(extraAudit ?? {}),
      },
    }),
    scope === "series" || effectiveInput.recurrence
      ? invalidateGcalCalendarCache([...affectedGoogleIds])
      : invalidateGcalCache(
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
  const updatedKahWindow = recurringKahWindow(
    effectiveInput.recurrence,
    effectiveInput.start,
    updatedWindow,
    effectiveInput.timeOption !== "range",
  );
  if (updatedKahWindow) {
    dispatchKahBreachCheck({
      windowStart: updatedKahWindow.start,
      windowEnd: updatedKahWindow.end,
      allDay: effectiveInput.timeOption !== "range",
      eventTitle: renderedTitle,
      actor: actorFromSession(session),
      savedEventOverseas: effectiveInput.outOfCamp && effectiveInput.overseas,
      savedEventUserIds: effectiveInput.inviteeUserIds,
    });
  }
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
  return { ok: true, eventId, copies: liveCopies, scope };
}

// --- Repeating-series scopes ------------------------------------------------

/** A recurring parent plus the ref the write path operates on. */
interface ResolvedParent {
  ref: EventRef;
  parent: GcalEventItem;
  googleCalendarId: string;
}

/** The parent copy's naive start (all-day inclusive convention for its end). */
function parentStartNaive(item: GcalEventItem): string {
  return item.allDay
    ? `${utcToDateString(item.start)} 00:00:00`
    : formatInstantToNaive(item.start);
}

function parentEndNaive(item: GcalEventItem): string {
  return item.allDay
    ? `${subOneDay(utcToDateString(item.end))} 00:00:00`
    : formatInstantToNaive(item.end);
}

/** Build the parent ref from the clicked instance's `recurringEventId`. */
async function resolveParentRef(ref: EventRef): Promise<ResolvedParent | null> {
  if (!ref.recurringEventId) {
    return null;
  }
  const googleCalendarId = await resolveGoogleCalendarId(ref.calendarId);
  if (!googleCalendarId) {
    return null;
  }
  const integration = await getGoogleIntegration();
  const parent = await integration.getEvent(googleCalendarId, ref.recurringEventId);
  if (!parent) {
    return null;
  }
  const people = parseEventPeople(parent.description);
  return {
    parent,
    googleCalendarId,
    ref: {
      calendarId: ref.calendarId,
      googleEventId: parent.id,
      eventId: people.eventId ?? ref.eventId,
      start: parentStartNaive(parent),
      end: parentEndNaive(parent),
      allDay: parent.allDay,
      creatorId: people.creatorId,
      inviteeUserIds: people.userIds,
      inviteeDepartmentIds: people.departmentIds,
      ownerOnlyEdits: parseEventOwnerOnlyEdits(parent.description),
      registrationEnabled: parseEventRegistrationEnabled(parent.description),
      recurringEventId: null,
      originalStartTime: null,
    },
  };
}

/** Re-run the modification guard against the stored copy's people (not the ref). */
async function verifyStoredGuard(
  session: Awaited<ReturnType<typeof requireSession>>,
  stored: EventRef,
): Promise<string | null> {
  const memberships = await activeMembershipsByDepartment(stored.inviteeDepartmentIds);
  return modifyGuard(
    session,
    {
      creatorId: stored.creatorId,
      inviteeUserIds: stored.inviteeUserIds,
      inviteeDepartmentIds: stored.inviteeDepartmentIds,
      ownerOnlyEdits: stored.ownerOnlyEdits,
    },
    memberships,
  );
}

/** Whether two normalized rules are the same (for remaining-count adjustment). */
function sameRecurrence(a: RecurrenceRule | null, b: RecurrenceRule | null): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** The series parent merge: presentation fields from the form, series fields stored. */
function mergeSinglePresentation(
  stored: EventFormValues,
  input: EventFormValues,
): EventFormValues {
  return {
    ...stored,
    title: input.title,
    timeOption: input.timeOption,
    start: input.start,
    end: input.end,
    startAmPm: input.startAmPm,
    endAmPm: input.endAmPm,
    eventType: input.eventType,
    outOfCamp: input.outOfCamp,
    overseas: input.overseas,
    location: input.location,
  };
}

/** Instances of one occurrence of `eventId` in a calendar. */
async function findOccurrenceInstances(params: {
  googleCalendarId: string;
  eventId: string | null;
  ref: EventRef;
  input: EventFormValues | null;
}): Promise<GcalEventItem[]> {
  const integration = await getGoogleIntegration();
  const range = withMargin(
    params.input
      ? unionRange(
          absEventRange(params.ref.start, params.ref.end, params.ref.allDay),
          absEventRange(
            params.input.start,
            params.input.end,
            params.input.timeOption !== "range",
          ),
        )
      : absEventRange(params.ref.start, params.ref.end, params.ref.allDay),
  );
  const items = await integration.listEvents(params.googleCalendarId, range.start, range.end, {
    singleEvents: true,
  });
  return items.filter((item) => {
    if (params.eventId && parseEventPeople(item.description).eventId !== params.eventId) {
      return false;
    }
    if (!params.eventId && item.id !== params.ref.googleEventId) {
      return false;
    }
    if (!params.ref.originalStartTime) {
      return item.id === params.ref.googleEventId;
    }
    const key = item.originalStartTime
      ? normalizeOriginalStartTime(item.originalStartTime, item.allDay)
      : null;
    return key === params.ref.originalStartTime;
  });
}

/** Stored exceptions of one series in a calendar, from `fromNaive` forward. */
async function listSeriesExceptions(params: {
  googleCalendarId: string;
  parentId: string;
  fromNaive: string;
  toNaive: string;
}): Promise<GcalEventItem[]> {
  const integration = await getGoogleIntegration();
  const from = parseNaiveToInstant(params.fromNaive);
  const to = parseNaiveToInstant(`${addDays(params.toNaive.slice(0, 10), 1)} 23:59:59`);
  // `singleEvents:false` returns parents + stored exceptions (not generated
  // instances), which is exactly the cleanup set.
  const items = await integration.listEvents(params.googleCalendarId, from, to, {
    singleEvents: false,
  });
  return items.filter(
    (item) =>
      item.recurringEventId === params.parentId &&
      item.id !== params.parentId &&
      item.status !== "cancelled",
  );
}

/** The truncation payload for a parent's recurrence at `splitNaive`. */
function truncatedRecurrence(
  parent: GcalEventItem,
  splitNaive: string,
): { lines: string[]; description: string; rule: RecurrenceRule } | null {
  const parsed = parseRRule(parent.recurrence);
  const rule =
    parsed.rule ??
    parseEventRecurrence(parent.description) ??
    null;
  if (!rule) {
    return null;
  }
  const until = subOneDay(splitNaive.slice(0, 10));
  if (until < parentStartNaive(parent).slice(0, 10)) {
    return null;
  }
  const next: RecurrenceRule = { ...rule, count: null, until };
  const lines = [recurrenceToRRule(next, parentStartNaive(parent), parent.allDay), ...parsed.extraLines];
  const description = rewriteEventNotes(parent.description, (notes) => ({
    ...notes,
    recurrence: next,
  }));
  return { lines, description, rule: next };
}

/**
 * Apply a "This event" edit: create/update one Google exception per target
 * calendar. Participants, pin, lock and registration are series-level and are
 * preserved from the stored copy (the wizard disables them in this scope).
 */
async function performSingleOccurrenceUpdate(
  session: Awaited<ReturnType<typeof requireSession>>,
  ref: EventRef,
  input: EventFormValues,
): Promise<EventActionResult> {
  if (!ref.recurringEventId) {
    return { ok: false, error: "This event is not part of a repeating series" };
  }
  const occurrenceRef = ref;
  const resolved = await resolveParentRef(ref);
  if (!resolved) {
    return { ok: false, error: "Could not find the repeating series" };
  }
  const storedGuardError = await verifyStoredGuard(session, resolved.ref);
  if (storedGuardError) {
    return { ok: false, error: storedGuardError };
  }
  if (parseEventRegistrationEnabled(resolved.parent.description)) {
    return { ok: false, error: "Registration events are edited as a series" };
  }
  const integration = await getGoogleIntegration();
  const googleCalendarId = await resolveGoogleCalendarId(ref.calendarId);
  const instance = googleCalendarId
    ? await integration.getEvent(googleCalendarId, ref.googleEventId)
    : null;
  const stored = eventFormValuesFromCopy(instance ?? resolved.parent);
  if (!stored) {
    return { ok: false, error: "Could not read the stored occurrence" };
  }
  const seriesRule = parseEventRecurrence(resolved.parent.description);
  const merged: EventFormValues = {
    ...mergeSinglePresentation(stored, input),
    recurrence: seriesRule,
  };
  const titleContext = await buildEventTitleContext(merged);
  const effectiveInput = resolveEffectiveInput(merged, titleContext);
  const eventId = resolved.ref.eventId ?? ref.eventId ?? crypto.randomUUID();
  const targets = await refTargetCalendars(resolved.ref);
  const [googleIds, baseUrl] = await Promise.all([
    resolveGoogleCalendarIds(targets),
    appBaseUrl(),
  ]);
  const namesPromise = Promise.all([
    calendarNames(targets),
    getUsersByIds([
      ...new Set([
        ...(resolved.ref.creatorId ? [resolved.ref.creatorId] : []),
        ...resolved.ref.inviteeUserIds,
      ]),
    ]),
  ]).catch(() => null);

  const live: EventMutationCopy[] = [];
  let firstInstance: GcalEventItem | null = instance;
  const touchedGoogleIds = new Set<string>();
  try {
    for (const target of targets) {
      const targetGoogleId = googleIds[target];
      if (!targetGoogleId) {
        continue;
      }
      const found = await findOccurrenceInstances({
        googleCalendarId: targetGoogleId,
        eventId: resolved.ref.eventId,
        ref,
        input,
      });
      for (const copy of found) {
        if (!firstInstance) {
          firstInstance = copy;
        }
        await integration.updateEvent(
          copy.id,
          buildGcalEventInput(
            targetGoogleId,
            target,
            effectiveInput,
            eventId,
            titleContext,
            baseUrl,
            {
              recurrence: seriesRule,
              writeRecurrence: false,
              override: true,
              timedSeries: true,
            },
          ),
        );
        live.push({ calendarId: target, googleEventId: copy.id });
        touchedGoogleIds.add(targetGoogleId);
      }
    }
  } catch (error) {
    return { ok: false, error: describeError(error, "Could not update this occurrence") };
  }
  if (live.length === 0 || !firstInstance) {
    return { ok: false, error: "This occurrence no longer exists" };
  }
  const names = await namesPromise;
  const namesResolved: EventSnapshotNames = {
    departmentNames: names?.[0] ?? {},
    userNames: namesById(names?.[1] ?? []),
  };
  const instanceRef: EventRef = {
    ...resolved.ref,
    googleEventId: firstInstance.id,
    start: firstInstance.allDay
      ? `${utcToDateString(firstInstance.start)} 00:00:00`
      : formatInstantToNaive(firstInstance.start),
    end: parentEndNaive(firstInstance),
    allDay: firstInstance.allDay,
    recurringEventId: ref.recurringEventId,
    originalStartTime: occurrenceRef.originalStartTime,
  };
  const before = snapshotFromCopy(instanceRef, firstInstance, namesResolved, targets);
  const after = buildEventSnapshot({
    title: renderEventTitle({
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
    }),
    description: effectiveInput.title,
    type: effectiveInput.eventType,
    timeParts: timePartsOf(effectiveInput),
    outOfCamp: effectiveInput.outOfCamp,
    overseas: effectiveInput.overseas,
    pinned: effectiveInput.pinned,
    registrationEnabled: effectiveInput.registrationEnabled === true,
    registrationCap: effectiveInput.registrationCap ?? null,
    repeats: seriesRule ? recurrenceSummary(seriesRule, resolved.ref.start) : null,
    location: effectiveInput.location,
    departmentIds: targets,
    inviteeUserIds: effectiveInput.inviteeUserIds,
    creatorId: effectiveInput.creatorId || null,
    names: namesResolved,
  });
  const changes = diffFields(before, after);
  const updatedWindow = absEventRange(
    effectiveInput.start,
    effectiveInput.end,
    effectiveInput.timeOption !== "range",
  );
  await Promise.all([
    logAction({
      ...actorFromSession(session),
      action: AUDIT_ACTIONS.eventUpdate,
      entityType: "calendar",
      entityId: targets[0] ?? ref.calendarId,
      entityName: after.title ?? "Untitled event",
      method: "updateEvent",
      details: {
        ...changes,
        eventId,
        seriesScope: "This event",
        occurrenceStart: ref.originalStartTime,
      },
    }),
    invalidateGcalCache(
      [...touchedGoogleIds],
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
    googleEventIds: live.map((copy) => copy.googleEventId),
    snapshot: after,
    timeParts: timePartsOf(effectiveInput),
    changes: changes.changes,
    actor: webhookActorFrom(session),
    occurredAt: new Date(),
  });
  dispatchKahBreachCheck({
    windowStart: updatedWindow.start,
    windowEnd: updatedWindow.end,
    allDay: effectiveInput.timeOption !== "range",
    eventTitle: after.title ?? "",
    actor: actorFromSession(session),
    savedEventOverseas: effectiveInput.outOfCamp && effectiveInput.overseas,
    savedEventUserIds: effectiveInput.inviteeUserIds,
  });
  return { ok: true, eventId, copies: live, scope: "single" };
}

/**
 * Apply a "This and following" edit: create the successor series first, then
 * truncate the old series at the split. Future stored exceptions belong to the
 * old pattern and are removed (the successor starts from the form's values).
 */
async function performFollowingUpdate(
  session: Awaited<ReturnType<typeof requireSession>>,
  ref: EventRef,
  input: EventFormValues,
): Promise<EventActionResult> {
  if (!ref.recurringEventId) {
    return { ok: false, error: "This event is not part of a repeating series" };
  }
  const resolved = await resolveParentRef(ref);
  if (!resolved) {
    return { ok: false, error: "Could not find the repeating series" };
  }
  const storedGuardError = await verifyStoredGuard(session, resolved.ref);
  if (storedGuardError) {
    return { ok: false, error: storedGuardError };
  }
  if (parseEventRegistrationEnabled(resolved.parent.description)) {
    return { ok: false, error: "Registration events are edited as a series" };
  }
  if (!resolved.ref.eventId) {
    return {
      ok: false,
      error: "This repeating series was created outside the app; edit this occurrence only",
    };
  }
  const integration = await getGoogleIntegration();
  const seriesStart = parentStartNaive(resolved.parent);
  const parentRule =
    parseEventRecurrence(resolved.parent.description) ?? parseRRule(resolved.parent.recurrence).rule;
  if (!parentRule) {
    return {
      ok: false,
      error: "This series uses a custom repeat rule; edit it in Google Calendar",
    };
  }
  let splitAt = ref.originalStartTime ?? null;
  if (!splitAt) {
    const googleCalendarId = await resolveGoogleCalendarId(ref.calendarId);
    const instance = googleCalendarId
      ? await integration.getEvent(googleCalendarId, ref.googleEventId)
      : null;
    splitAt = instance?.originalStartTime
      ? normalizeOriginalStartTime(instance.originalStartTime, instance.allDay)
      : null;
  }
  if (!splitAt) {
    return { ok: false, error: "Could not resolve the occurrence to split at" };
  }
  // Splitting at the first occurrence is the same as editing the whole series.
  const index = occurrenceIndex(parentRule, seriesStart, splitAt);
  if (index !== null && index <= 1) {
    return updateEvent(resolved.ref, input, "series");
  }

  const inputRule = normalizeRecurrence(input.recurrence, input.start);
  const successorRuleBase = sameRecurrence(inputRule, parentRule)
    ? remainingRecurrence(parentRule, seriesStart, splitAt)
    : inputRule;
  const successorRule =
    successorRuleBase && successorRuleBase.count === 1 ? null : successorRuleBase;
  const normalized = {
    ...input,
    recurrence: successorRule,
  };
  const titleContext = await buildEventTitleContext(normalized);
  const effectiveInput = resolveEffectiveInput(normalized, titleContext);
  if (
    !titleContext.registrationEnabled &&
    effectiveInput.inviteeUserIds.length === 0 &&
    effectiveInput.inviteeDepartments.length === 0
  ) {
    return { ok: false, error: "Add at least one participant or department" };
  }
  const successorId = crypto.randomUUID();
  const oldTargets = await refTargetCalendars(resolved.ref);
  const newTargets = await resolveTargetCalendars(effectiveInput, resolved.ref.calendarId);
  const [allGoogleIds, baseUrl] = await Promise.all([
    resolveGoogleCalendarIds([...new Set([...oldTargets, ...newTargets])]),
    appBaseUrl(),
  ]);
  const oldRange = withMargin(absEventRange(seriesStart, parentEndNaive(resolved.parent), resolved.parent.allDay));
  const splitDate = splitAt.slice(0, 10);
  const horizonEnd = addDays(seriesStart.slice(0, 10), 365 * EXCEPTION_SCAN_HORIZON_YEARS);
  const finiteEnd = lastOccurrence(parentRule, seriesStart);
  const exceptionEnd = finiteEnd ? finiteEnd.slice(0, 10) : horizonEnd;

  // Read the old parents (series mode) and their future exceptions before any
  // write, so a failure leaves the original series untouched.
  const oldReads: Array<{ target: string; googleCalendarId: string; parents: GcalEventItem[] }> = [];
  const successorCreates: Array<{ target: string; googleCalendarId: string; googleEventId: string }> =
    [];
  try {
    for (const target of oldTargets) {
      const googleCalendarId = allGoogleIds[target];
      if (!googleCalendarId) {
        continue;
      }
      const parents = await findCopies(googleCalendarId, resolved.ref.eventId ?? "", oldRange, null, {
        parents: true,
      });
      oldReads.push({ target, googleCalendarId, parents });
    }
    // Create the successor in every new target first.
    for (const target of newTargets) {
      const googleCalendarId = allGoogleIds[target];
      if (!googleCalendarId) {
        continue;
      }
      const existing = await findExistingSuccessor(googleCalendarId, ref.eventId, splitAt);
      if (existing) {
        successorCreates.push({ target, googleCalendarId, googleEventId: existing.id });
        continue;
      }
      const created = await integration.createEvent(
        buildGcalEventInput(
          googleCalendarId,
          target,
          effectiveInput,
          successorId,
          titleContext,
          baseUrl,
          {
            recurrence: successorRule,
            writeRecurrence: true,
            timedSeries: Boolean(successorRule),
            extraNotes: {
              splitFromEventId: ref.eventId ?? undefined,
              splitAt,
            },
          },
        ),
      );
      successorCreates.push({ target, googleCalendarId, googleEventId: created.id });
    }
  } catch (error) {
    await Promise.allSettled(
      successorCreates.map((copy) => integration.deleteEvent(copy.googleCalendarId, copy.googleEventId)),
    );
    return { ok: false, error: describeError(error, "Could not split the repeating event") };
  }
  // Truncate the old series and remove its future exceptions.
  try {
    for (const read of oldReads) {
      const exceptions = await listSeriesExceptions({
        googleCalendarId: read.googleCalendarId,
        parentId: read.parents[0]?.id ?? "",
        fromNaive: `${splitDate} 00:00:00`,
        toNaive: exceptionEnd,
      });
      await Promise.allSettled(
        exceptions.map((exception) =>
          integration.deleteEvent(read.googleCalendarId, exception.id),
        ),
      );
      for (const parent of read.parents) {
        const truncated = truncatedRecurrence(parent, splitAt);
        if (!truncated) {
          await integration.deleteEvent(read.googleCalendarId, parent.id);
          continue;
        }
        await integration.patchEvent(parent.id, {
          calendarId: read.googleCalendarId,
          recurrence: truncated.lines,
          description: truncated.description,
        });
      }
    }
  } catch (error) {
    return { ok: false, error: describeError(error, "Could not update the rest of the series") };
  }

  const affectedGoogleIds = new Set([
    ...oldReads.map((read) => read.googleCalendarId),
    ...successorCreates.map((copy) => copy.googleCalendarId),
  ]);
  await Promise.all([
    logAction({
      ...actorFromSession(session),
      action: AUDIT_ACTIONS.eventUpdate,
      entityType: "calendar",
      entityId: newTargets[0] ?? ref.calendarId,
      entityName: renderEventTitle({
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
      }) || "Untitled event",
      method: "updateEvent",
      details: {
        eventId: ref.eventId,
        seriesScope: "This and following",
        splitAt,
        successorEventId: successorId,
        repeats: successorRule ? recurrenceSummary(successorRule, effectiveInput.start) : null,
      },
    }),
    invalidateGcalCalendarCache([...affectedGoogleIds]),
    invalidatePinnedCache(),
  ]);
  const successorWindow = absEventRange(
    effectiveInput.start,
    effectiveInput.end,
    effectiveInput.timeOption !== "range",
  );
  const kahWindow = recurringKahWindow(
    successorRule,
    effectiveInput.start,
    successorWindow,
    effectiveInput.timeOption !== "range",
  );
  if (kahWindow) {
    dispatchKahBreachCheck({
      windowStart: kahWindow.start,
      windowEnd: kahWindow.end,
      allDay: effectiveInput.timeOption !== "range",
      eventTitle: "Split repeating event",
      actor: actorFromSession(session),
      savedEventOverseas: effectiveInput.outOfCamp && effectiveInput.overseas,
      savedEventUserIds: effectiveInput.inviteeUserIds,
    });
  }
  return {
    ok: true,
    eventId: ref.eventId,
    successorEventId: successorId,
    copies: successorCreates.map(({ target, googleEventId }) => ({
      calendarId: target,
      googleEventId,
    })),
    scope: "following",
  };
}

/** Find an already-created successor after a failed/retried split. */
async function findExistingSuccessor(
  googleCalendarId: string,
  sourceEventId: string | null,
  splitAt: string,
): Promise<GcalEventItem | null> {
  if (!sourceEventId) {
    return null;
  }
  const integration = await getGoogleIntegration();
  const range = withMargin(absEventRange(splitAt, splitAt, false));
  const items = await integration.listEvents(googleCalendarId, range.start, range.end, {
    singleEvents: false,
  });
  return (
    items.find((item) => {
      if (item.recurringEventId) {
        return false;
      }
      const notes = parseEventNotes(item.description);
      return notes?.splitFromEventId === sourceEventId && notes?.splitAt === splitAt;
    }) ?? null
  );
}

/**
 * Self-service registration for a registration-enabled event. Only the acting
 * user's own participant entry is toggled; every other field comes from the
 * stored Google copy, never from the client. The shared update pipeline then
 * reconciles department copies, re-renders the title, and records the change.
 */
/**
 * Register/deregister the acting user for one occurrence of a repeating
 * registration event. The roster lives on that occurrence's Google exception
 * (all department copies), while the parent remains the series configuration
 * and keeps every other occurrence's roster untouched.
 */
async function setOccurrenceRegistration(
  session: Awaited<ReturnType<typeof requireSession>>,
  ref: EventRef,
  intent: RegistrationIntent,
): Promise<EventActionResult> {
  if (!ref.recurringEventId || !ref.eventId) {
    return { ok: false, error: "This event is not open for registration" };
  }
  const resolved = await resolveParentRef(ref);
  if (!resolved) {
    return { ok: false, error: "Could not find the repeating series" };
  }
  if (!parseEventRegistrationEnabled(resolved.parent.description)) {
    return { ok: false, error: "This event is not open for registration" };
  }
  const parentValues = eventFormValuesFromCopy(resolved.parent);
  if (!parentValues) {
    return { ok: false, error: "This event is not open for registration" };
  }
  const integration = await getGoogleIntegration();
  const googleCalendarId = await resolveGoogleCalendarId(ref.calendarId);
  const instance = googleCalendarId
    ? await integration.getEvent(googleCalendarId, ref.googleEventId)
    : null;
  const occurrenceValues = eventFormValuesFromCopy(instance ?? resolved.parent);
  if (!occurrenceValues) {
    return { ok: false, error: "Could not read this occurrence" };
  }
  // Older/foreign payloads may omit the occurrence slot; recover it from the
  // instance so every department copy can be matched by `originalStartTime`.
  const occurrenceRef: EventRef =
    ref.originalStartTime || !instance?.originalStartTime
      ? ref
      : {
          ...ref,
          originalStartTime: normalizeOriginalStartTime(
            instance.originalStartTime,
            instance.allDay,
          ),
        };
  const nextInvitees = applyRegistrationIntent(
    occurrenceValues.inviteeUserIds,
    session.user.id,
    intent,
  );
  const unchanged =
    nextInvitees.length === occurrenceValues.inviteeUserIds.length &&
    nextInvitees.every((id, index) => id === occurrenceValues.inviteeUserIds[index]);
  if (unchanged) {
    return { ok: true, eventId: ref.eventId, copies: [], scope: "single" };
  }
  // The series cap is authoritative; an occurrence exception's copied cap may
  // be stale after a series cap edit (those exceptions are reset anyway).
  const cap = parentValues.registrationCap ?? null;
  if (
    intent === "register" &&
    isRegistrationFull(occurrenceValues.inviteeUserIds, cap, session.user.id)
  ) {
    return {
      ok: false,
      error: `This event is full (${registrationSeatCount(occurrenceValues.inviteeUserIds)} / ${cap}).`,
    };
  }
  const seriesRule =
    parseEventRecurrence(resolved.parent.description) ?? occurrenceValues.recurrence ?? null;
  const normalized = clampEventEnd({
    ...occurrenceValues,
    inviteeUserIds: nextInvitees,
    creatorId: parentValues.creatorId || occurrenceValues.creatorId,
    ownerOnlyEdits: parentValues.ownerOnlyEdits,
    registrationEnabled: true,
    registrationCap: cap,
    recurrence: seriesRule,
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
  const eventId = resolved.ref.eventId ?? ref.eventId;
  const targets = await refTargetCalendars(resolved.ref);
  const [googleIds, baseUrl] = await Promise.all([
    resolveGoogleCalendarIds(targets),
    appBaseUrl(),
  ]);
  const namesPromise = Promise.all([
    calendarNames(targets),
    getUsersByIds([
      ...new Set([
        ...(resolved.ref.creatorId ? [resolved.ref.creatorId] : []),
        ...resolved.ref.inviteeUserIds,
        ...nextInvitees,
      ]),
    ]),
  ]).catch(() => null);

  const live: EventMutationCopy[] = [];
  let firstInstance: GcalEventItem | null = instance;
  const touchedGoogleIds = new Set<string>();
  try {
    for (const target of targets) {
      const targetGoogleId = googleIds[target];
      if (!targetGoogleId) {
        continue;
      }
      const found = await findOccurrenceInstances({
        googleCalendarId: targetGoogleId,
        eventId: resolved.ref.eventId,
        ref: occurrenceRef,
        input: null,
      });
      for (const copy of found) {
        if (!firstInstance) {
          firstInstance = copy;
        }
        await integration.updateEvent(
          copy.id,
          buildGcalEventInput(
            targetGoogleId,
            target,
            effectiveInput,
            eventId,
            titleContext,
            baseUrl,
            {
              recurrence: seriesRule,
              writeRecurrence: false,
              override: true,
              timedSeries: true,
            },
          ),
        );
        live.push({ calendarId: target, googleEventId: copy.id });
        touchedGoogleIds.add(targetGoogleId);
      }
    }
  } catch (error) {
    return { ok: false, error: describeError(error, "Could not update registration") };
  }
  if (live.length === 0 || !firstInstance) {
    return { ok: false, error: "This occurrence no longer exists" };
  }
  const names = await namesPromise;
  const namesResolved: EventSnapshotNames = {
    departmentNames: names?.[0] ?? {},
    userNames: namesById(names?.[1] ?? []),
  };
  const instanceRef: EventRef = {
    ...resolved.ref,
    googleEventId: firstInstance.id,
    start: firstInstance.allDay
      ? `${utcToDateString(firstInstance.start)} 00:00:00`
      : formatInstantToNaive(firstInstance.start),
    end: parentEndNaive(firstInstance),
    allDay: firstInstance.allDay,
    recurringEventId: ref.recurringEventId,
    originalStartTime: occurrenceRef.originalStartTime,
  };
  const before = snapshotFromCopy(instanceRef, firstInstance, namesResolved, targets);
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
    registrationEnabled: true,
    registrationCap: effectiveInput.registrationCap ?? null,
    repeats: seriesRule ? recurrenceSummary(seriesRule, resolved.ref.start) : null,
    location: effectiveInput.location,
    departmentIds: targets,
    inviteeUserIds: effectiveInput.inviteeUserIds,
    creatorId: effectiveInput.creatorId || null,
    names: namesResolved,
  });
  const changes = diffFields(before, after);
  const occurrenceWindow = absEventRange(
    effectiveInput.start,
    effectiveInput.end,
    effectiveInput.timeOption !== "range",
  );
  await Promise.all([
    logAction({
      ...actorFromSession(session),
      action: AUDIT_ACTIONS.eventUpdate,
      entityType: "calendar",
      entityId: targets[0] ?? ref.calendarId,
      entityName: after.title ?? "Untitled event",
      method: "setEventRegistration",
      details: {
        ...changes,
        eventId,
        seriesScope: "This event",
        occurrenceStart: occurrenceRef.originalStartTime,
        registration: intent === "register" ? "Registered" : "Deregistered",
      },
    }),
    invalidateGcalCache([...touchedGoogleIds], monthsInRange(ref.start, ref.end)),
    invalidatePinnedCache(),
  ]);
  dispatchEventWebhook({
    action: WEBHOOK_ACTIONS.eventUpdated,
    eventId,
    googleEventIds: live.map((copy) => copy.googleEventId),
    snapshot: after,
    timeParts: timePartsOf(effectiveInput),
    changes: changes.changes,
    actor: webhookActorFrom(session),
    occurredAt: new Date(),
  });
  dispatchKahBreachCheck({
    windowStart: occurrenceWindow.start,
    windowEnd: occurrenceWindow.end,
    allDay: effectiveInput.timeOption !== "range",
    eventTitle: renderedTitle,
    actor: actorFromSession(session),
    savedEventOverseas: effectiveInput.outOfCamp && effectiveInput.overseas,
    savedEventUserIds: effectiveInput.inviteeUserIds,
  });
  return { ok: true, eventId, copies: live, scope: "single" };
}

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

  // A recurring registration event keeps one roster per occurrence, stored on
  // that occurrence's Google exception. The parent only owns the series config.
  if (ref.recurringEventId) {
    return setOccurrenceRegistration(session, ref, intent);
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
      recurringEventId: null,
      originalStartTime: null,
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

/**
 * Delete one occurrence of a repeating series: Google marks each copy's
 * instance cancelled. The series parent and every other occurrence remain.
 */
async function deleteSingleOccurrence(
  session: Awaited<ReturnType<typeof requireSession>>,
  ref: EventRef,
): Promise<EventActionResult> {
  if (!ref.recurringEventId) {
    return { ok: false, error: "This event is not part of a repeating series" };
  }
  const occurrenceRef = ref;
  const resolved = await resolveParentRef(ref);
  if (!resolved) {
    return { ok: false, error: "Could not find the repeating series" };
  }
  const storedGuardError = await verifyStoredGuard(session, resolved.ref);
  if (storedGuardError) {
    return { ok: false, error: storedGuardError };
  }
  if (parseEventRegistrationEnabled(resolved.parent.description)) {
    return { ok: false, error: "Registration events are edited as a series" };
  }
  const integration = await getGoogleIntegration();
  const targets = await refTargetCalendars(resolved.ref);
  const googleIds = await resolveGoogleCalendarIds(targets);
  const deleted: EventMutationCopy[] = [];
  let first: GcalEventItem | null = null;
  try {
    for (const target of targets) {
      const googleCalendarId = googleIds[target];
      if (!googleCalendarId) {
        continue;
      }
      const found = await findOccurrenceInstances({
        googleCalendarId,
        eventId: resolved.ref.eventId,
        ref,
        input: null,
      });
      for (const copy of found) {
        if (!first) {
          first = copy;
        }
        await integration.deleteEvent(googleCalendarId, copy.id);
        deleted.push({ calendarId: target, googleEventId: copy.id });
      }
    }
  } catch (error) {
    return { ok: false, error: describeError(error, "Could not delete this occurrence") };
  }
  if (deleted.length === 0 || !first) {
    return { ok: false, error: "This occurrence no longer exists" };
  }
  const names = await Promise.all([
    calendarNames(targets),
    getUsersByIds([
      ...new Set([
        ...(resolved.ref.creatorId ? [resolved.ref.creatorId] : []),
        ...resolved.ref.inviteeUserIds,
      ]),
    ]),
  ]).catch(() => null);
  const namesResolved: EventSnapshotNames = {
    departmentNames: names?.[0] ?? {},
    userNames: namesById(names?.[1] ?? []),
  };
  const instanceRef: EventRef = {
    ...resolved.ref,
    googleEventId: first.id,
    start: first.allDay
      ? `${utcToDateString(first.start)} 00:00:00`
      : formatInstantToNaive(first.start),
    end: parentEndNaive(first),
    allDay: first.allDay,
    recurringEventId: ref.recurringEventId,
    originalStartTime: occurrenceRef.originalStartTime,
  };
  const snapshot = snapshotFromCopy(instanceRef, first, namesResolved, targets);
  const affected = [
    ...new Set(
      targets
        .map((target) => googleIds[target])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  await Promise.all([
    logAction({
      ...actorFromSession(session),
      action: AUDIT_ACTIONS.eventDelete,
      entityType: "calendar",
      entityId: targets[0] ?? ref.calendarId,
      entityName: snapshot.title ?? "Untitled event",
      method: "deleteEvent",
      details: {
        ...snapshot,
        eventId: resolved.ref.eventId,
        googleEventIds: deleted.map((copy) => copy.googleEventId),
        seriesScope: "This event",
        occurrenceStart: ref.originalStartTime,
      },
    }),
    invalidateGcalCache(affected, monthsInRange(ref.start, ref.end)),
    invalidatePinnedCache(),
  ]);
  dispatchEventWebhook({
    action: WEBHOOK_ACTIONS.eventDeleted,
    eventId: resolved.ref.eventId,
    googleEventIds: deleted.map((copy) => copy.googleEventId),
    snapshot,
    timeParts: null,
    changes: null,
    actor: webhookActorFrom(session),
    occurredAt: new Date(),
  });
  return { ok: true, eventId: resolved.ref.eventId, copies: deleted, scope: "single" };
}

/**
 * Delete this and following occurrences: truncate each old parent before the
 * split and remove the old pattern's future exceptions.
 */
async function deleteFollowingOccurrence(
  session: Awaited<ReturnType<typeof requireSession>>,
  ref: EventRef,
): Promise<EventActionResult> {
  if (!ref.recurringEventId) {
    return { ok: false, error: "This event is not part of a repeating series" };
  }
  const resolved = await resolveParentRef(ref);
  if (!resolved) {
    return { ok: false, error: "Could not find the repeating series" };
  }
  const storedGuardError = await verifyStoredGuard(session, resolved.ref);
  if (storedGuardError) {
    return { ok: false, error: storedGuardError };
  }
  if (parseEventRegistrationEnabled(resolved.parent.description)) {
    return { ok: false, error: "Registration events are edited as a series" };
  }
  if (!resolved.ref.eventId) {
    return {
      ok: false,
      error: "This repeating series was created outside the app; edit this occurrence only",
    };
  }
  const integration = await getGoogleIntegration();
  const seriesStart = parentStartNaive(resolved.parent);
  const parentRule =
    parseEventRecurrence(resolved.parent.description) ?? parseRRule(resolved.parent.recurrence).rule;
  if (!parentRule) {
    return {
      ok: false,
      error: "This series uses a custom repeat rule; edit it in Google Calendar",
    };
  }
  let splitAt = ref.originalStartTime ?? null;
  if (!splitAt) {
    const googleCalendarId = await resolveGoogleCalendarId(ref.calendarId);
    const instance = googleCalendarId
      ? await integration.getEvent(googleCalendarId, ref.googleEventId)
      : null;
    splitAt = instance?.originalStartTime
      ? normalizeOriginalStartTime(instance.originalStartTime, instance.allDay)
      : null;
  }
  if (!splitAt) {
    return { ok: false, error: "Could not resolve the occurrence to split at" };
  }
  const index = occurrenceIndex(parentRule, seriesStart, splitAt);
  if (index !== null && index <= 1) {
    return deleteEvent(resolved.ref, "series");
  }
  const eventId = resolved.ref.eventId as string;
  const targets = await refTargetCalendars(resolved.ref);
  const googleIds = await resolveGoogleCalendarIds(targets);
  const oldRange = withMargin(
    absEventRange(seriesStart, parentEndNaive(resolved.parent), resolved.parent.allDay),
  );
  const finiteEnd = lastOccurrence(parentRule, seriesStart);
  const exceptionEnd = finiteEnd
    ? finiteEnd.slice(0, 10)
    : addDays(seriesStart.slice(0, 10), 365 * EXCEPTION_SCAN_HORIZON_YEARS);
  let firstCopy: GcalEventItem | null = null;
  const affected: string[] = [];
  try {
    for (const target of targets) {
      const googleCalendarId = googleIds[target];
      if (!googleCalendarId) {
        continue;
      }
      const parents = await findCopies(
        googleCalendarId,
        eventId,
        oldRange,
        null,
        { parents: true },
      );
      if (parents.length === 0) {
        continue;
      }
      firstCopy = firstCopy ?? parents[0];
      affected.push(googleCalendarId);
      const exceptions = await listSeriesExceptions({
        googleCalendarId,
        parentId: parents[0].id,
        fromNaive: `${splitAt.slice(0, 10)} 00:00:00`,
        toNaive: exceptionEnd,
      });
      await Promise.allSettled(
        exceptions.map((exception) => integration.deleteEvent(googleCalendarId, exception.id)),
      );
      for (const parent of parents) {
        const truncated = truncatedRecurrence(parent, splitAt);
        if (!truncated) {
          await integration.deleteEvent(googleCalendarId, parent.id);
          continue;
        }
        await integration.patchEvent(parent.id, {
          calendarId: googleCalendarId,
          recurrence: truncated.lines,
          description: truncated.description,
        });
      }
    }
  } catch (error) {
    return { ok: false, error: describeError(error, "Could not delete the rest of the series") };
  }
  if (!firstCopy) {
    return { ok: false, error: "Could not find the repeating series" };
  }
  const names = await Promise.all([
    calendarNames(targets),
    getUsersByIds([
      ...new Set([
        ...(resolved.ref.creatorId ? [resolved.ref.creatorId] : []),
        ...resolved.ref.inviteeUserIds,
      ]),
    ]),
  ]).catch(() => null);
  const namesResolved: EventSnapshotNames = {
    departmentNames: names?.[0] ?? {},
    userNames: namesById(names?.[1] ?? []),
  };
  const snapshot = snapshotFromCopy(resolved.ref, firstCopy, namesResolved, targets);
  await Promise.all([
    logAction({
      ...actorFromSession(session),
      action: AUDIT_ACTIONS.eventUpdate,
      entityType: "calendar",
      entityId: targets[0] ?? ref.calendarId,
      entityName: snapshot.title ?? "Untitled event",
      method: "deleteEvent",
      details: {
        ...snapshot,
        eventId: resolved.ref.eventId,
        seriesScope: "This and following (delete)",
        splitAt,
      },
    }),
    invalidateGcalCalendarCache(affected),
    invalidatePinnedCache(),
  ]);
  dispatchEventWebhook({
    action: WEBHOOK_ACTIONS.eventUpdated,
    eventId: resolved.ref.eventId,
    googleEventIds: [],
    snapshot,
    timeParts: null,
    changes: null,
    actor: webhookActorFrom(session),
    occurredAt: new Date(),
  });
  return { ok: true, eventId: resolved.ref.eventId, copies: [], scope: "following" };
}

/** Delete every linked copy of a logical event, or one scope of a repeating one. */
export async function deleteEvent(
  ref: EventRef,
  scope?: EventMutationScope,
): Promise<EventActionResult> {
  const session = await requireSession();
  if (ref.recurringEventId && !scope) {
    return { ok: false, error: "Choose what to delete for this repeating event" };
  }
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

  if (scope === "single") {
    return deleteSingleOccurrence(session, ref);
  }
  if (scope === "following") {
    return deleteFollowingOccurrence(session, ref);
  }

  // Series delete: resolve the parent if the client only held an occurrence.
  let seriesRef = ref;
  if (ref.recurringEventId) {
    const resolved = await resolveParentRef(ref);
    if (!resolved) {
      return { ok: false, error: "Could not find the repeating series" };
    }
    if (!resolved.ref.eventId) {
      return {
        ok: false,
        error: "This repeating series was created outside the app; edit this occurrence only",
      };
    }
    const storedGuardError = await verifyStoredGuard(session, resolved.ref);
    if (storedGuardError) {
      return { ok: false, error: storedGuardError };
    }
    seriesRef = resolved.ref;
  }

  const [targets, fallback, integration] = await Promise.all([
    refTargetCalendars(seriesRef),
    legacyFallback(seriesRef),
    getGoogleIntegration(),
  ]);
  const range = withMargin(absEventRange(seriesRef.start, seriesRef.end, seriesRef.allDay));
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
      const found = await findCopies(googleCalendarId, seriesRef.eventId ?? "", range, fallback, {
        parents: true,
      });
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
    seriesRef,
    firstCopy,
    {
      departmentNames: namesResult?.[0] ?? {},
      userNames: namesById(namesResult?.[1] ?? []),
    },
    targets,
  );
  const isSeries = scope === "series" || Boolean(ref.recurringEventId);
  // Independent writes on the response path: run them concurrently instead of
  // paying three serial round trips. Cache invalidation stays awaited so the
  // client's post-delete re-read cannot race a pre-delete cache row.
  await Promise.all([
    logAction({
      ...actorFromSession(session),
      action: AUDIT_ACTIONS.eventDelete,
      entityType: "calendar",
      entityId: seriesRef.calendarId,
      entityName: snapshot.title ?? "Untitled event",
      method: "deleteEvent",
      details: {
        ...snapshot,
        eventId: seriesRef.eventId,
        googleEventIds: deletedGoogleEventIds,
        ...(isSeries ? { seriesScope: "All events" } : {}),
      },
    }),
    isSeries
      ? invalidateGcalCalendarCache([...affectedGoogleIds])
      : invalidateGcalCache(
          [...affectedGoogleIds],
          monthsInRange(seriesRef.start, seriesRef.end),
        ),
    invalidatePinnedCache(),
  ]);
  dispatchEventWebhook({
    action: WEBHOOK_ACTIONS.eventDeleted,
    eventId: seriesRef.eventId,
    googleEventIds: deletedGoogleEventIds,
    snapshot,
    timeParts: null,
    changes: null,
    actor: webhookActorFrom(session),
    occurredAt: new Date(),
  });
  return { ok: true, eventId: seriesRef.eventId, copies: deletedCopies };
}
