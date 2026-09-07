"use server";

import {
  absEventRange,
  addDays,
  formatInstantToNaive,
  parseNaiveToInstant,
  subOneDay,
} from "@/lib/events/datetime";
import { clashingEventsFor, USER_CLASH_SCAN_DAYS } from "@/lib/events/clashQuery";
import {
  computeClashes,
  findUserClashGroups,
  type ClashCandidateInput,
} from "@/lib/events/clashes";
import { activeMembershipsByDepartment, listUsers } from "@/lib/roster/queries";
import { canChangeLock, modifyGuard } from "@/lib/events/guards";
import {
  buildEventTitleContext,
  resolveEffectiveInput,
  resolveTargetCalendars,
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
  /** Department name the conflicting copy was read from. */
  calendarName: string;
  /** Display window, UTC+8 wall clock (all-day ends are converted to inclusive). */
  startNaive: string;
  endNaive: string;
  allDay: boolean;
  external: boolean;
  /** Candidate people this event double-books (sorted by name). */
  affected: EventClashAffected[];
}

export type EventClashCheckResult =
  | {
      ok: true;
      /** Distinct candidate people the check covered. */
      checkedPeople: number;
      clashes: EventClashEntry[];
      /** Id of the acting session user (for the "clashes with you" emphasis). */
      currentUserId: string;
    }
  | { ok: false; error: string };

/** Naive display strings for a conflict's window (all-day end made inclusive). */
function conflictWindowNaive(
  start: Date,
  end: Date,
  allDay: boolean,
): {
  startNaive: string;
  endNaive: string;
} {
  if (allDay) {
    const startDate = formatInstantToNaive(start).slice(0, 10);
    const exclusiveEnd = formatInstantToNaive(end).slice(0, 10);
    const endDate = subOneDay(exclusiveEnd);
    return { startNaive: `${startDate} 00:00:00`, endNaive: `${endDate} 00:00:00` };
  }
  return { startNaive: formatInstantToNaive(start), endNaive: formatInstantToNaive(end) };
}

export async function checkEventClashes(
  request: EventClashCheckRequest,
): Promise<EventClashCheckResult> {
  const session = await requireSession();
  try {
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
        return { ok: true, checkedPeople: 0, clashes: [], currentUserId: session.user.id };
      }
    }

    const errors = validateEventForm(normalized);
    if (Object.keys(errors).length > 0) {
      // Incomplete/invalid windows have nothing to compare yet.
      return { ok: true, checkedPeople: 0, clashes: [], currentUserId: session.user.id };
    }

    const titleContext = await buildEventTitleContext(normalized);
    const effectiveInput = resolveEffectiveInput(normalized, titleContext);
    const targets = await resolveTargetCalendars(effectiveInput, request.ref?.calendarId ?? null);
    if (targets.length === 0) {
      // No department calendars derive — the mutation itself would be rejected
      // ("Assign yourself to a department or tag an invitee"), so nothing to warn about.
      return { ok: true, checkedPeople: 0, clashes: [], currentUserId: session.user.id };
    }

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

    const candidate: ClashCandidateInput = {
      start: window.start,
      end: window.end,
      creatorId: effectiveInput.creatorId || null,
      inviteeUserIds: effectiveInput.inviteeUserIds,
      inviteeDepartments: effectiveInput.inviteeDepartments,
    };
    const computed = computeClashes({
      candidate,
      events,
      activeUsers: rosterUsers,
    });

    const clashes: EventClashEntry[] = computed.clashes.map((clash) => {
      const { startNaive, endNaive } = conflictWindowNaive(clash.start, clash.end, clash.allDay);
      return {
        title: clash.title,
        calendarName: clash.calendarName,
        startNaive,
        endNaive,
        allDay: clash.allDay,
        external: clash.external,
        affected: clash.affectedUserIds
          .map((userId) => ({ userId, name: nameById.get(userId) ?? "" }))
          .filter((entry) => entry.name !== "")
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    });

    return {
      ok: true,
      checkedPeople: computed.checkedPeople,
      clashes,
      currentUserId: session.user.id,
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
          return {
            title: event.title,
            calendarName: event.calendarName,
            startNaive,
            endNaive,
            allDay: event.allDay,
            external: event.external,
            affected: shared,
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
