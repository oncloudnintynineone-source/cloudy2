"use server";

import type { MantineColor } from "@mantine/core";

import {
  absEventRange,
  addDays,
  formatInstantToNaive,
  monthsInRange,
  parseNaiveToInstant,
} from "@/lib/events/datetime";
import { findEventByGroupId } from "@/lib/events/deepLink";
import { clashingEventsFor, USER_CLASH_SCAN_DAYS } from "@/lib/events/clashQuery";
import {
  computeClashes,
  effectiveCandidateWindow,
  effectiveEventWindow,
  findUserClashGroups,
  type ClashCandidateInput,
} from "@/lib/events/clashes";
import { clashLabelFor, type ClashLabelContext } from "@/lib/events/clashLabel";
import { conflictWindowNaive } from "@/lib/events/clashDisplay";
import { shapeClashDetail } from "@/lib/events/clashDetail";
import { fetchRangeEvents, listCalendars, type CalendarEvent } from "@/lib/events/queries";
import type { TimeOption } from "@/lib/events/timeOptions";
import { activeMembershipsByDepartment, listUsers } from "@/lib/roster/queries";
import { getEventTitleTemplateMap, getSettings } from "@/lib/settings/queries";
import { canChangeLock, modifyGuard } from "@/lib/events/guards";
import {
  buildEventTitleContext,
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
import { requireSession } from "@/lib/session";

/**
 * Read-only, pre-submit clash advisory for the event wizard's review step
 * (see docs/event-clashes.md). It re-resolves the candidate exactly like a
 * create/update would (same organizer resolution → validation → shared
 * resolution chain → target derivation), reads the overlapping events off the
 * month cache, and reports which of the candidate's people would be
 * double-booked. It never writes, never audits, never invalidates a cache.
 *
 * Advisory by design: the result cannot block a save and is not authoritative
 * for a mutation — the caller's own later create/update performs the guards.
 */

export interface EventClashCheckRequest {
  /** The form values exactly as they would be submitted to create/update. */
  values: EventFormValues;
  /**
   * Present when editing an existing event (its copies are excluded from the
   * check); null for create and duplicate.
   */
  ref: EventRef | null;
}

/** One candidate user double-booked by a conflicting event. */
export interface EventClashAffected {
  userId: string;
  name: string;
}

/** One conflicting existing event. */
export interface EventClashEntry {
  /** The stored Google Calendar summary of the conflicting event. */
  title: string;
  /** Logical event group id (drives the dashboard deep link), or null for external. */
  eventId: string | null;
  /** Registry (department) calendar id of the conflicting copy (deep-link hint). */
  calendarId: string;
  /** Google event id of the conflicting copy (resolves external/legacy events). */
  googleEventId: string;
  /** Department name the conflicting copy was read from. */
  calendarName: string;
  /** Display window, UTC+8 wall clock (all-day ends are converted to inclusive). */
  startNaive: string;
  endNaive: string;
  allDay: boolean;
  external: boolean;
  /** Candidate people this event double-books (sorted by name). */
  affected: EventClashAffected[];
  /** Event type name from the notes block, or null (untyped/external). */
  typeName: string | null;
  /** Event type shortname (acronym), or null when unset/unknown. */
  typeShortname: string | null;
  /** The raw (pre-template) title from the notes block; null for legacy/external. */
  rawTitle: string | null;
  /** Display color: the event type's color, else the department fallback. */
  color: MantineColor;
  /** True when the event occupies whole days (`timeOption: "full"`). */
  occupiesFullDay: boolean;
  /** Effective occupancy window (half-day aware), naive UTC+8. */
  effectiveStartNaive: string;
  effectiveEndNaive: string;
  /** Datetime option used to create the event. */
  timeOption: TimeOption;
  /** Start half-of-day indicator for "half" events, else null. */
  startAmPm: "AM" | "PM" | null;
  /** End half-of-day indicator for "half" events, else null. */
  endAmPm: "AM" | "PM" | null;
  /**
   * Template-rendered label for the Double Booking report (the `doubleBooking`
   * assignment target, else Master). Unset on the wizard advisory, which keeps
   * the stored summary.
   */
  displayLabel?: string;
}

/** The candidate event's effective window, for the review-step timeline. */
export interface ClashCandidateWindow {
  effectiveStartNaive: string;
  effectiveEndNaive: string;
  occupiesFullDay: boolean;
}

export type EventClashCheckResult =
  | {
      ok: true;
      /** Distinct candidate people the check covered. */
      checkedPeople: number;
      clashes: EventClashEntry[];
      /** Id of the acting session user (for the "clashes with you" emphasis). */
      currentUserId: string;
      /**
       * The candidate's effective occupancy window (null when the check was
       * skipped: invalid form, failed edit guard, or no derivable calendars).
       */
      candidate: ClashCandidateWindow | null;
    }
  | { ok: false; error: string };

/** A resolved candidate context for the clash check and the wizard detail read. */
interface ClashContext {
  effectiveInput: EventFormValues;
  titleContext: EventTitleContext;
  /** Department calendar ids the candidate would write copies to. */
  targets: string[];
}

/**
 * Shared resolution for the pre-submit advisory and the wizard's in-place
 * detail read: normalize the candidate exactly like a create/update (fixed
 * organizer), mirror the edit modification guard, validate, then run the shared
 * resolution chain and derive the target calendars. Returns null when the
 * candidate has nothing to compare (failed guard, invalid form, or no derivable
 * calendars) — the same cases the advisory reports as "no clashes".
 */
async function resolveClashContext(
  request: EventClashCheckRequest,
  session: Awaited<ReturnType<typeof requireSession>>,
): Promise<ClashContext | null> {
  const normalized = clampEventEnd(
    resolveEventAuthor(
      request.values,
      session.user.id,
      request.ref,
      canChangeLock(session, request.ref?.creatorId ?? null),
    ),
  );

  // Editing: mirror updateEvent's modification guard so the advisory is not
  // richer than the mutation the actor is allowed to perform.
  if (request.ref) {
    const memberships = await activeMembershipsByDepartment(request.ref.inviteeDepartmentIds);
    const guardError = modifyGuard(
      session,
      {
        creatorId: request.ref.creatorId,
        inviteeUserIds: request.ref.inviteeUserIds,
        inviteeDepartmentIds: request.ref.inviteeDepartmentIds,
        ownerOnlyEdits: request.ref.ownerOnlyEdits,
      },
      memberships,
    );
    if (guardError) {
      return null;
    }
  }

  // Incomplete/invalid windows have nothing to compare yet.
  if (Object.keys(validateEventForm(normalized)).length > 0) {
    return null;
  }

  const titleContext = await buildEventTitleContext(normalized);
  const effectiveInput = resolveEffectiveInput(normalized, titleContext);
  // No department calendars derive — the mutation itself would be rejected
  // ("Assign yourself to a department or tag an invitee"), so nothing to warn about.
  const targets = await resolveTargetCalendars(effectiveInput, request.ref?.calendarId ?? null);
  if (targets.length === 0) {
    return null;
  }

  return { effectiveInput, titleContext, targets };
}

export async function checkEventClashes(
  request: EventClashCheckRequest,
): Promise<EventClashCheckResult> {
  const session = await requireSession();
  try {
    const context = await resolveClashContext(request, session);
    if (!context) {
      return {
        ok: true,
        checkedPeople: 0,
        clashes: [],
        currentUserId: session.user.id,
        candidate: null,
      };
    }

    const { effectiveInput, titleContext, targets } = context;
    const allDay = effectiveInput.timeOption !== "range";
    const window = absEventRange(effectiveInput.start, effectiveInput.end, allDay);

    const overlapping = await clashingEventsFor(targets, window.start, window.end);

    // Exclude the event being edited: every copy shares its group id; a legacy
    // event (no group id yet) is excluded by its original copy.
    const refEventId = request.ref?.eventId ?? null;
    const legacyRef = request.ref && request.ref.eventId === null ? request.ref : null;
    const events = overlapping.filter((event) => {
      if (refEventId !== null && event.eventId === refEventId) {
        return false;
      }
      if (
        legacyRef !== null &&
        event.calendarId === legacyRef.calendarId &&
        event.googleEventId === legacyRef.googleEventId
      ) {
        return false;
      }
      return true;
    });

    const activeUserRows = (await listUsers()).filter((user) => user.status === "active");
    const rosterUsers = activeUserRows.map((user) => ({
      id: user.id,
      departmentId: user.department?.id ?? null,
    }));
    const nameById = new Map(activeUserRows.map((user) => [user.id, user.name]));

    // Template-driven labels for the conflicting events (same resolution as the
    // Double Booking page: `doubleBooking` target, else Master).
    const [settings, templateMap, calendars] = await Promise.all([
      getSettings(),
      getEventTitleTemplateMap(),
      listCalendars(),
    ]);
    const assignedId = settings.eventTitleTemplateAssignments.doubleBooking;
    const labelRecipe =
      (assignedId ? templateMap.get(assignedId)?.recipe : undefined) ?? settings.eventTitleRecipe;
    const labelCtx: ClashLabelContext = {
      nameTemplate: settings.nameTemplate,
      usersById: new Map(
        activeUserRows.map((user) => [
          user.id,
          {
            name: user.name,
            shortname: user.shortname,
            departmentName: user.department?.name ?? null,
          },
        ]),
      ),
      calendarNames: new Map(calendars.map((calendar) => [calendar.id, calendar.name])),
    };
    const inputByCopyId = new Map(
      events.map((event) => [`${event.calendarId}:${event.googleEventId}`, event]),
    );

    const candidate: ClashCandidateInput = {
      start: window.start,
      end: window.end,
      timeOption: effectiveInput.timeOption,
      startAmPm: effectiveInput.startAmPm || null,
      endAmPm: effectiveInput.endAmPm || null,
      creatorId: effectiveInput.creatorId || null,
      inviteeUserIds: effectiveInput.inviteeUserIds,
      inviteeDepartments: effectiveInput.inviteeDepartments,
      excludeFromClash: titleContext.excludeFromClash,
    };

    // The candidate's effective occupancy window, for the review-step timeline.
    const candidateEffective = effectiveCandidateWindow(candidate);
    const candidateWindow: ClashCandidateWindow = {
      effectiveStartNaive: formatInstantToNaive(candidateEffective.start),
      effectiveEndNaive: formatInstantToNaive(candidateEffective.end),
      occupiesFullDay: candidate.timeOption === "full",
    };

    const computed = computeClashes({
      candidate,
      events,
      activeUsers: rosterUsers,
    });

    const clashes: EventClashEntry[] = computed.clashes.map((clash) => {
      const { startNaive, endNaive } = conflictWindowNaive(clash.start, clash.end, clash.allDay);
      const effective = effectiveEventWindow(clash);
      return {
        title: clash.title,
        eventId: clash.eventId,
        calendarId: clash.calendarId,
        googleEventId: clash.googleEventId,
        calendarName: clash.calendarName,
        startNaive,
        endNaive,
        allDay: clash.allDay,
        external: clash.external,
        affected: clash.affectedUserIds
          .map((userId) => ({ userId, name: nameById.get(userId) ?? "" }))
          .filter((entry) => entry.name !== "")
          .sort((a, b) => a.name.localeCompare(b.name)),
        typeName: clash.typeName,
        typeShortname: clash.typeShortname,
        rawTitle: clash.rawTitle,
        color: clash.color,
        occupiesFullDay: clash.occupiesFullDay,
        effectiveStartNaive: formatInstantToNaive(effective.start),
        effectiveEndNaive: formatInstantToNaive(effective.end),
        timeOption: clash.timeOption,
        startAmPm: clash.startAmPm,
        endAmPm: clash.endAmPm,
        displayLabel: (() => {
          const input = inputByCopyId.get(clash.copyId);
          return input ? clashLabelFor(input, labelRecipe, labelCtx) : clash.title;
        })(),
      };
    });

    return {
      ok: true,
      checkedPeople: computed.checkedPeople,
      clashes,
      currentUserId: session.user.id,
      candidate: candidateWindow,
    };
  } catch (error) {
    console.error("[clashes] Clash check failed", error);
    return { ok: false, error: "Could not check for clashes" };
  }
}

/**
 * One detected double-booking for a scanned user: its overlapping events, each
 * carrying the roster people double-booked by the whole group (always the
 * scanned user, plus anyone every group event occupies).
 */
export interface UserClashGroupEntry {
  events: EventClashEntry[];
}

export type UserClashCheckResult =
  | {
      ok: true;
      /** Id of the acting session user (drives the "You" emphasis when self). */
      currentUserId: string;
      /** The roster user the scan covered. */
      targetUserId: string;
      targetName: string;
      /** Covered date span, inclusive, UTC+8 wall clock (`YYYY-MM-DD`). */
      rangeStartDate: string;
      rangeEndDate: string;
      groups: UserClashGroupEntry[];
      /**
       * Why nothing was scanned. `no-department` = the target has no department
       * calendar (nothing can occupy them); `no-active-user` = the target is
       * not on the active roster. null = a real scan ran and found no clashes.
       */
      skipReason: "no-department" | "no-active-user" | null;
    }
  | { ok: false; error: string };

/**
 * Read-only "Double Booking" scan of a user's *existing* events (see
 * docs/user-clashes.md): every event that occupies the target user carries a
 * copy on that user's own department calendar, so reading that one calendar
 * over the next `USER_CLASH_SCAN_DAYS` and running the pure
 * `findUserClashGroups` (events that occupy the target and overlap each other)
 * is the complete picture. No candidate exists here — it is not the wizard's
 * pre-submit advisory. Never writes, never audits, never invalidates a cache.
 *
 * Regular users may only scan themselves; admins may scan any active roster
 * user.
 */
export async function checkUserClashes(request: {
  targetUserId?: string;
}): Promise<UserClashCheckResult> {
  const session = await requireSession();
  try {
    const targetUserId = request.targetUserId ?? session.user.id;
    if (targetUserId !== session.user.id && session.user.role !== "admin") {
      return { ok: false, error: "You can only check your own schedule" };
    }

    const users = await listUsers();
    const activeUserRows = users.filter((user) => user.status === "active");
    const target = activeUserRows.find((user) => user.id === targetUserId) ?? null;

    const now = new Date();
    const today = formatInstantToNaive(now).slice(0, 10);
    const rangeStartDate = today;
    const rangeEndDate = addDays(today, USER_CLASH_SCAN_DAYS - 1);
    const rangeStart = parseNaiveToInstant(`${rangeStartDate} 00:00:00`);
    const rangeEnd = parseNaiveToInstant(`${addDays(today, USER_CLASH_SCAN_DAYS)} 00:00:00`);

    const base: {
      ok: true;
      currentUserId: string;
      targetUserId: string;
      targetName: string;
      rangeStartDate: string;
      rangeEndDate: string;
    } = {
      ok: true,
      currentUserId: session.user.id,
      targetUserId,
      targetName: target?.name ?? "",
      rangeStartDate,
      rangeEndDate,
    };

    if (!target) {
      return { ...base, groups: [], skipReason: "no-active-user" };
    }
    if (!target.department) {
      return { ...base, groups: [], skipReason: "no-department" };
    }

    const rosterUsers = activeUserRows.map((user) => ({
      id: user.id,
      departmentId: user.department?.id ?? null,
    }));
    const nameById = new Map(activeUserRows.map((user) => [user.id, user.name]));

    const overlapping = await clashingEventsFor([target.department.id], rangeStart, rangeEnd);
    const computed = findUserClashGroups({
      targetUserId,
      events: overlapping,
      activeUsers: rosterUsers,
    });

    // The report's event labels render through the title-template engine: the
    // `doubleBooking` assignment target when set, else Master (docs §1.8).
    const [settings, templateMap, calendars] = await Promise.all([
      getSettings(),
      getEventTitleTemplateMap(),
      listCalendars(),
    ]);
    const assignedId = settings.eventTitleTemplateAssignments.doubleBooking;
    const labelRecipe =
      (assignedId ? templateMap.get(assignedId)?.recipe : undefined) ?? settings.eventTitleRecipe;
    const labelCtx: ClashLabelContext = {
      nameTemplate: settings.nameTemplate,
      usersById: new Map(
        activeUserRows.map((user) => [
          user.id,
          {
            name: user.name,
            shortname: user.shortname,
            departmentName: user.department?.name ?? null,
          },
        ]),
      ),
      calendarNames: new Map(calendars.map((calendar) => [calendar.id, calendar.name])),
    };

    const groups: UserClashGroupEntry[] = computed.groups.map((group) => {
      const shared = group.sharedUserIds
        .map((userId) => ({ userId, name: nameById.get(userId) ?? "" }))
        .filter((entry) => entry.name !== "")
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        events: group.events.map((event) => {
          const { startNaive, endNaive } = conflictWindowNaive(
            event.start,
            event.end,
            event.allDay,
          );
          const effective = effectiveEventWindow(event);
          return {
            title: event.title,
            eventId: event.eventId,
            calendarId: event.calendarId,
            googleEventId: event.googleEventId,
            calendarName: event.calendarName,
            startNaive,
            endNaive,
            allDay: event.allDay,
            external: event.external,
            affected: shared,
            typeName: event.typeName ?? null,
            typeShortname: event.typeShortname ?? null,
            rawTitle: event.rawTitle ?? null,
            color: event.color ?? "gray",
            occupiesFullDay: event.occupiesFullDay ?? event.timeOption === "full",
            effectiveStartNaive: formatInstantToNaive(effective.start),
            effectiveEndNaive: formatInstantToNaive(effective.end),
            timeOption: event.timeOption,
            startAmPm: event.startAmPm,
            endAmPm: event.endAmPm,
            displayLabel: clashLabelFor(event, labelRecipe, labelCtx),
          };
        }),
      };
    });

    return { ...base, groups, skipReason: null };
  } catch (error) {
    console.error("[clashes] Double-booking scan failed", error);
    return { ok: false, error: "Could not check for double bookings" };
  }
}

export type ClashEventDetailResult =
  | {
      ok: true;
      /** The full schedule-ready event, for the in-place detail modal. */
      event: CalendarEvent;
      /** Active-roster user id → display name (owner/participants). */
      peopleNames: Record<string, string>;
      /** Calendar (department) id → display name. */
      calendarNames: Record<string, string>;
      /** The acting user's active department ids (mirrors the dashboard's edit check). */
      myActiveDepartmentIds: string[];
    }
  | { ok: false; error: string };

/**
 * Read-only fetch of one clashing event for the Double Booking page's in-place
 * detail modal. Mirrors `checkUserClashes`'s guard: regular users may only
 * resolve their own home department; admins may resolve the scanned target's.
 * Reads through the sanctioned month cache (never raw `listEvents`).
 */
export async function getClashEventDetail(request: {
  targetUserId?: string;
  calendarId: string;
  eventId: string | null;
  googleEventId: string;
  startNaive: string;
  endNaive: string;
}): Promise<ClashEventDetailResult> {
  const session = await requireSession();
  try {
    const targetUserId = request.targetUserId ?? session.user.id;
    if (targetUserId !== session.user.id && session.user.role !== "admin") {
      return { ok: false, error: "You can only view your own events" };
    }

    const users = await listUsers();
    const activeUsers = users.filter((user) => user.status === "active");
    const target = activeUsers.find((user) => user.id === targetUserId) ?? null;
    // The scan only ever surfaces copies on the target's own department
    // calendar, so anything else is a tampered request.
    if (!target?.department || target.department.id !== request.calendarId) {
      return { ok: false, error: "Event not found" };
    }

    const events = await fetchRangeEvents({
      months: monthsInRange(request.startNaive, request.endNaive),
      calendarIds: [request.calendarId],
      typeFilter: [],
      userFilter: [],
    });
    const event = request.eventId
      ? findEventByGroupId(events, request.eventId)
      : (events.find((candidate) => candidate.payload.googleEventId === request.googleEventId) ??
        null);
    if (!event) {
      return { ok: false, error: "Event not found" };
    }

    return { ok: true, ...(await shapeClashDetail(event, activeUsers, session.user.id)) };
  } catch (error) {
    console.error("[clashes] Event detail fetch failed", error);
    return { ok: false, error: "Could not load the event" };
  }
}

/**
 * Read-only fetch of one conflicting event for the wizard's review-step
 * advisory in-place detail modal (docs/event-clashes.md §1.6). Unlike the
 * Double Booking page's read, the conflicting copy may sit on any of the
 * candidate's target calendars (a tagged user's department, a tagged
 * department), so authorization re-runs the same resolution the advisory did
 * and only allows calendars the candidate would write copies to. Reads through
 * the sanctioned month cache (never raw `listEvents`).
 */
export async function getWizardClashEventDetail(request: {
  request: EventClashCheckRequest;
  calendarId: string;
  eventId: string | null;
  googleEventId: string;
  startNaive: string;
  endNaive: string;
}): Promise<ClashEventDetailResult> {
  const session = await requireSession();
  try {
    const context = await resolveClashContext(request.request, session);
    // The advisory only ever surfaces copies on the candidate's target
    // calendars, so anything else is a tampered request.
    if (!context || !context.targets.includes(request.calendarId)) {
      return { ok: false, error: "Event not found" };
    }

    const events = await fetchRangeEvents({
      months: monthsInRange(request.startNaive, request.endNaive),
      calendarIds: [request.calendarId],
      typeFilter: [],
      userFilter: [],
    });
    const event = request.eventId
      ? findEventByGroupId(events, request.eventId)
      : (events.find((candidate) => candidate.payload.googleEventId === request.googleEventId) ??
        null);
    if (!event) {
      return { ok: false, error: "Event not found" };
    }

    const users = await listUsers();
    const activeUsers = users.filter((user) => user.status === "active");
    return { ok: true, ...(await shapeClashDetail(event, activeUsers, session.user.id)) };
  } catch (error) {
    console.error("[clashes] Wizard event detail fetch failed", error);
    return { ok: false, error: "Could not load the event" };
  }
}
