/**
 * Pure, client-safe helpers for the dashboard's optimistic event mutations.
 *
 * The dashboard's grid data is a server-owned `events` prop (per-view fetch +
 * layered cache, see docs/events-cache.md). Mutations are server actions that
 * take hundreds of ms to ~seconds (serial Google writes per target calendar,
 * then a read-your-own-writes refresh that hits Google again), so the grid only
 * reflects a create/edit/delete long after the user confirms.
 *
 * Optimistic mutations close that gap by letting the client render a stand-in
 * `CalendarEvent` immediately. This module holds the shared, I/O-free logic so
 * it can be unit-tested without a database or Google: the overlay model
 * (`OptimisticOp`), the merge function (`applyOptimisticOps`), and the
 * stand-in builder (`buildOptimisticEvent`). Reconciliation with the
 * authoritative server data happens in `DashboardView` (see
 * docs/optimistic-mutations.md).
 *
 * Convention: a stand-in event has `payload.googleEventId === ""` until the
 * server action returns the real ids (`isOptimisticStandIn`). Stand-ins are
 * never clickable into the details modal (the click handlers guard on this).
 */

import type { CalendarEvent, CalendarEventPayload } from "./queries";
import { addOneDay } from "./datetime";
import { effectiveCalendarColor, effectiveEventTypeColor } from "./eventColors";
import { clampEventEnd, type EventFormValues } from "./validate";

/**
 * A fresh client id for a pending mutation and its stand-in event (the create
 * placeholder group id). Browsers and Node ≥ 19 both provide `crypto.randomUUID`.
 */
export function nextOptimisticOpId(): string {
  return crypto.randomUUID();
}

/** Base fields every overlay entry carries. */
export interface OptimisticOpBase {
  /** Stable client id for this pending mutation (created at submit time). */
  id: string;
  /**
   * True once the corresponding server action resolved `{ ok: true }`. Settled
   * ops are dropped by `DashboardView` on the next authoritative `events`
   * prop change (read-your-own-writes guarantees the refreshed data already
   * reflects the mutation). Until then they keep rendering so the chip never
   * flickers out during the refresh.
   */
  settled: boolean;
}

/**
 * Render an event with optimistic content: a create (stand-in) or an edit
 * (the existing event replaced in place with the submitted values).
 */
export interface OptimisticUpsertOp extends OptimisticOpBase {
  kind: "upsert";
  /** The stand-in event the grid should show in place of / in addition to base data. */
  event: CalendarEvent;
}

/**
 * Hide an event the user deleted. Matches base events by group id when the
 * event has one (a logical event's copies collapse to one row), else by the
 * exact copy (calendar id + google event id) for legacy ungrouped events.
 */
export interface OptimisticRemoveOp extends OptimisticOpBase {
  kind: "remove";
  /** Registry calendar (department) id of the copy the user deleted from. */
  calendarId: string;
  googleEventId: string;
  /** Group id of the deleted event, or null for a legacy (ungrouped) event. */
  eventId: string | null;
}

export type OptimisticOp = OptimisticUpsertOp | OptimisticRemoveOp;

/** Construct a create/edit overlay entry (children apply it before the action). */
export function optimisticUpsert(id: string, event: CalendarEvent): OptimisticUpsertOp {
  return { id, kind: "upsert", event, settled: false };
}

/** Construct a delete overlay entry (children apply it before the action). */
export function optimisticRemove(
  id: string,
  params: Pick<OptimisticRemoveOp, "calendarId" | "googleEventId" | "eventId">,
): OptimisticRemoveOp {
  return { id, kind: "remove", settled: false, ...params };
}

/** The identity key a base event is deduped/replaced by. */
export function optimisticEventKey(event: CalendarEvent): string {
  return event.payload.eventId ?? `${event.payload.calendarId}:${event.payload.googleEventId}`;
}

/** Whether a calendar event matches an overlay entry's identity. */
function eventMatchesOp(event: CalendarEvent, op: OptimisticOp): boolean {
  if (op.kind === "remove") {
    if (op.eventId) {
      return event.payload.eventId === op.eventId;
    }
    return event.payload.calendarId === op.calendarId && event.payload.googleEventId === op.googleEventId;
  }
  const standIn = op.event;
  const key = optimisticEventKey(standIn);
  if (standIn.payload.eventId) {
    // Edits carry the real group id: replace whatever base copy has it. Creates
    // carry a client placeholder that nothing in base shares, so they add.
    return event.payload.eventId === key;
  }
  // A legacy edit (no group id yet) replaces the exact copy being edited.
  return (
    event.payload.calendarId === standIn.payload.calendarId &&
    event.payload.googleEventId === standIn.payload.googleEventId
  );
}

/** Chronological order — the base is already sorted; the merge keeps it stable. */
function byStart(a: CalendarEvent, b: CalendarEvent): number {
  return a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : a.end > b.end ? 1 : 0;
}

/**
 * The events the views should render: the authoritative server `events` prop
 * with every pending overlay op applied. Removals filter their matches out;
 * upserts replace a matching base event (edit) or append (create). The result
 * is re-sorted by start so the month grid's greedy row assigner and the
 * per-view memos keep seeing deterministic, chronological input.
 */
export function applyOptimisticOps(
  base: readonly CalendarEvent[],
  ops: readonly OptimisticOp[],
): CalendarEvent[] {
  // No pending mutations: the server `base` is already sorted, so skip the
  // copy-and-sort entirely (this runs for every view on every render).
  if (ops.length === 0) return base.slice();
  let events = base.slice();
  for (const op of ops) {
    if (op.kind === "remove") {
      events = events.filter((event) => !eventMatchesOp(event, op));
      continue;
    }
    const matched = events.some((event) => eventMatchesOp(event, op));
    if (!matched) {
      events = [...events, op.event];
    } else {
      events = events.map((event) => (eventMatchesOp(event, op) ? op.event : event));
    }
  }
  return events.sort(byStart);
}

/**
 * A stand-in event that has not yet been pinned to a real Google event id.
 * Real events always carry one, so an empty id is a reliable "optimistic"
 * marker. Stand-ins must not open the details modal (their edit/delete
 * reference would be meaningless until the ids are known).
 */
export function isOptimisticStandIn(
  event: Pick<CalendarEvent, "payload"> | null | undefined,
): boolean {
  return event?.payload.googleEventId === "";
}

/** The copy identity the stand-in reports until the action pins the real one. */
export interface OptimisticEventIdentity {
  /** Registry calendar (department) id the chip reports as home. */
  calendarId: string;
  /** Display name of that department (`payload.calendarName`). */
  calendarName: string;
  /**
   * Real Google id of the copy when known (edits reuse the shown copy's id);
   * "" for a not-yet-created copy — marks the chip as a stand-in.
   */
  googleEventId: string;
  /**
   * Logical group id: the existing one (edit) or a client placeholder
   * (create). null only for a legacy edit whose copy has no group yet.
   */
  eventId: string | null;
}

export interface OptimisticBuildParams {
  identity: OptimisticEventIdentity;
  /** The (client-validated) submit payload, matching the action's input shape. */
  values: EventFormValues;
  /** Acting session user; a blank `creatorId` falls back to them. */
  actingUserId: string;
  /**
   * The display title the grid will render for this event — already run
   * through the current view's display template, exactly as
   * `resolveDisplayTitles` renders the authoritative events.
   */
  title: string;
  /** Pinned color of the event's type; null falls back to the deterministic default. */
  eventTypeColor: string | null;
}

/**
 * Build a schedule-ready stand-in `CalendarEvent` mirroring what the server
 * action will write and what the read path will map back:
 *
 * - The same client normalization the action mirrors (`clampEventEnd`), with
 *   the organizer id defaulted to the acting user only when blank. The wizard
 *   already carries the fixed organizer (acting user on create/duplicate, the
 *   stored organizer on edit), so the stand-in matches the server's resolved
 *   author without any creator→invitee merge — the organizer participates only
 *   when in `inviteeUserIds`.
 * - Naive `start`/`end` in the read path's shape: timed events keep their wall
 *   clock; all-day (full/half) events are day-midnight values whose `end` is
 *   the *exclusive* day after the last day (the form stores the inclusive
 *   last day — mirror of `absEventRange` on write / `mapCalendarItem` on read).
 * - The same color resolution as `mapCalendarItem` (typed events use the
 *   type's effective color).
 */
export function buildOptimisticEvent(params: OptimisticBuildParams): CalendarEvent {
  const { identity, values, actingUserId, title, eventTypeColor } = params;
  const normalized = clampEventEnd({
    ...values,
    creatorId: values.creatorId.trim() || actingUserId,
  });
  const typeName = normalized.eventType.trim();
  const allDay = normalized.timeOption !== "range";
  const groupKey = identity.eventId ?? identity.googleEventId;
  const amPmOf = (value: string): CalendarEventPayload["startAmPm"] =>
    value === "AM" || value === "PM" ? value : null;

  return {
    id: `${identity.calendarId}:${groupKey}`,
    title: title.trim() || normalized.title.trim() || "(no title)",
    start: allDay ? `${normalized.start.slice(0, 10)} 00:00:00` : normalized.start,
    end: allDay ? `${addOneDay(normalized.end.slice(0, 10))} 00:00:00` : normalized.end,
    color: typeName
      ? effectiveEventTypeColor(typeName, eventTypeColor)
      : effectiveCalendarColor(identity.calendarId, null),
    payload: {
      calendarId: identity.calendarId,
      googleEventId: identity.googleEventId,
      allDay,
      eventType: typeName || null,
      calendarName: identity.calendarName,
      eventId: identity.eventId,
      creatorId: normalized.creatorId,
      inviteeUserIds: normalized.inviteeUserIds,
      inviteeDepartmentIds: normalized.inviteeDepartments,
      ownerOnlyEdits: normalized.ownerOnlyEdits,
      rawTitle: normalized.title,
      timeOption: normalized.timeOption,
      startAmPm: normalized.timeOption === "half" ? amPmOf(normalized.startAmPm) : null,
      endAmPm: normalized.timeOption === "half" ? amPmOf(normalized.endAmPm) : null,
      outOfCamp: normalized.outOfCamp,
      overseas: normalized.overseas,
      pinned: normalized.pinned,
      location: normalized.location,
      external: false,
    },
  };
}
