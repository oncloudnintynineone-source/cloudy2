"use server";

import { absEventRange, formatInstantToNaive, subOneDay } from "@/lib/events/datetime";
import { clashingEventsFor } from "@/lib/events/clashQuery";
import { computeClashes, type ClashCandidateInput } from "@/lib/events/clashes";
import { listUsers } from "@/lib/roster/queries";
import { ownershipGuard } from "@/lib/events/guards";
import {
  buildEventTitleContext,
  resolveEffectiveInput,
  resolveTargetCalendars,
} from "@/lib/events/writeContext";
import type { EventRef } from "@/lib/events/targets";
import {
  clampEventEnd,
  validateEventForm,
  withSelfCreator,
  type EventFormValues,
} from "@/lib/events/validate";
import { requireSession } from "@/lib/session";

/**
 * Read-only, pre-submit clash advisory for the event wizard's review step
 * (see docs/event-clashes.md). It re-resolves the candidate exactly like a
 * create/update would (same `withSelfCreator` → validation → shared
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
    const normalized = clampEventEnd(withSelfCreator(request.values, session.user.id));

    // Editing: mirror updateEvent's ownership guard so the advisory is not
    // richer than the mutation the actor is allowed to perform.
    if (request.ref && ownershipGuard(session, request.ref.creatorId)) {
      return { ok: true, checkedPeople: 0, clashes: [], currentUserId: session.user.id };
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
