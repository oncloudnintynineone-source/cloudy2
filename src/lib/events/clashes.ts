/**
 * Pure clash (double-booking) engine for the event create/edit wizard.
 *
 * Semantics (see docs/event-clashes.md): a calendar event *occupies* the
 * people it affects — each tagged attendee and every active member of each
 * tagged department (a department-level event is an event for everyone within
 * that department). The organizer is occupied only when they tagged themselves
 * as an attendee or belong to a tagged department — creating an event for
 * others does not book the organizer's own time. An event with no identifiable
 * people at all (externally created in Google, or a people-less legacy copy)
 * occupies every active member of the department calendar it sits on, mirroring
 * how the schedule view pins such events to their calendar's department row
 * (`expandScheduleEvents` in ./schedule.ts).
 *
 * Two events clash when their time windows overlap AND they share at least
 * one occupied user. The module is pure and unit-tested: all I/O (reading the
 * month cache, resolving the roster) happens in the callers (`clashQuery.ts`,
 * `clashActions.ts`).
 *
 * Kept free of any I/O so it can be unit-tested without a database.
 */

import type { MantineColor } from "@mantine/core";

import {
  halfDayRange,
  subOneDay,
  utcMidnightToSgt,
  utcToDateString,
} from "@/lib/events/datetime";
import type { TimeOption } from "@/lib/events/timeOptions";

/** One existing calendar event, pre-read and shaped for the engine. */
export interface ClashEventInput {
  /** Registry (department) calendar id this copy was read from. */
  calendarId: string;
  /** Google event id of this copy. */
  googleEventId: string;
  /** Logical group id shared by all department copies, or null (legacy/external). */
  eventId: string | null;
  /** Department name of `calendarId`, for display. */
  calendarName: string;
  /** The stored Google Calendar summary. */
  title: string;
  /** Absolute start instant (timed wall clock, all-day = UTC date). */
  start: Date;
  /** Absolute end instant, exclusive. */
  end: Date;
  /** Whether the event is stored as all-day (display only; dates carry the semantics). */
  allDay: boolean;
  /** True when the event was created directly in Google (no app notes). */
  external: boolean;
  /** Datetime option used to create the event ("range" | "full" | "half"). */
  timeOption: TimeOption;
  /** Start half-of-day indicator for "half" events, else null. */
  startAmPm: "AM" | "PM" | null;
  /** End half-of-day indicator for "half" events, else null. */
  endAmPm: "AM" | "PM" | null;
  /**
   * True when the event's type is informational and excluded from clash
   * checks — it occupies nobody, so it never conflicts (and never shows up in
   * a Double Booking scan). Resolved live from the event type config by the
   * caller (`clashQuery.ts`).
   */
  excludeFromClash?: boolean;
  /** People from the notes block: creator, tagged users, tagged departments. */
  people: {
    creatorId: string | null;
    userIds: string[];
    departmentIds: string[];
  };
  /** Event type name from the notes block, or null (untyped/external). Display only. */
  typeName?: string | null;
  /** Event type shortname (acronym), or null when unset/unknown. Display only. */
  typeShortname?: string | null;
  /** The raw (pre-template) title from the notes block; null for legacy/external. Display only. */
  rawTitle?: string | null;
  /** Display color: the event type's color, else the department fallback. Display only. */
  color?: MantineColor;
  /** True when the event occupies whole days (`timeOption: "full"`). Display only. */
  occupiesFullDay?: boolean;
  /** The event's location (Google field); "" when unset. Display only. */
  location?: string;
}

/** The event being created/edited, as the engine sees it. */
export interface ClashCandidateInput {
  /** Absolute start instant. */
  start: Date;
  /** Absolute end instant, exclusive. */
  end: Date;
  /** Datetime option used to create the event; drives the half-aware window. */
  timeOption: TimeOption;
  /** Start half-of-day indicator for "half" events, else null. */
  startAmPm: "AM" | "PM" | null;
  /** End half-of-day indicator for "half" events, else null. */
  endAmPm: "AM" | "PM" | null;
  /**
   * Effective organizer id (fixed: the acting user on create, the stored
   * organizer on edit); informational here — the organizer is occupied only
   * when present in `inviteeUserIds`.
   */
  creatorId: string | null;
  /** Effective tagged users (schedule rows). */
  inviteeUserIds: string[];
  /** Effective tagged departments (their active members count as affected). */
  inviteeDepartments: string[];
  /**
   * True when the candidate's type is informational — the whole check is
   * skipped (no clashes reported) because the event is not accounted for in
   * schedule conflicts.
   */
  excludeFromClash?: boolean;
}

/** Active roster user — the only users an event can "occupy". */
export interface ClashRosterUser {
  id: string;
  departmentId: string | null;
}

/** department id → the active roster user ids that belong to it. */
export type ActiveMembersByDepartment = ReadonlyMap<string, ReadonlyArray<string>>;

/** One double-booking: an existing event that overlaps and shares people. */
export interface EventClash {
  /** Representative copy id `${calendarId}:${googleEventId}` (logical events deduped). */
  copyId: string;
  /** Logical group id shared by all department copies, or null (legacy/external). */
  eventId: string | null;
  /** Registry (department) calendar id of the representative copy. */
  calendarId: string;
  /** Google event id of the representative copy (resolves external/legacy events). */
  googleEventId: string;
  /** Department name of the representative copy, for display. */
  calendarName: string;
  /** The stored Google Calendar summary of the conflicting event. */
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  external: boolean;
  /** Candidate user ids double-booked by this event (sorted). */
  affectedUserIds: string[];
  /** Event type name from the notes block, or null (untyped/external). Display only. */
  typeName: string | null;
  /** Event type shortname (acronym), or null when unset/unknown. Display only. */
  typeShortname: string | null;
  /** The raw (pre-template) title from the notes block; null for legacy/external. Display only. */
  rawTitle: string | null;
  /** Display color: the event type's color, else the department fallback. Display only. */
  color: MantineColor;
  /** True when the event occupies whole days (`timeOption: "full"`). Display only. */
  occupiesFullDay: boolean;
  /** Datetime option used to create the event. Display only. */
  timeOption: TimeOption;
  /** Start half-of-day indicator for "half" events, else null. Display only. */
  startAmPm: "AM" | "PM" | null;
  /** End half-of-day indicator for "half" events, else null. Display only. */
  endAmPm: "AM" | "PM" | null;
}

export interface ClashComputation {
  /** Distinct candidate users the check covered (people not on the roster are dropped). */
  checkedPeople: number;
  /** One entry per conflicting event, chronological then by calendar/title. */
  clashes: EventClash[];
}

/**
 * Whether two half-open instant windows [startA, endA) and [startB, endB)
 * overlap. Back-to-back windows (one ending exactly when the next starts) do
 * not clash. Pure.
 */
export function instantWindowsOverlap(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && startB < endA;
}

/**
 * The instants an existing event actually occupies for clash purposes. For
 * `range` events (and every non-`half` event) this is the stored window; for a
 * `half` event carrying both AM/PM markers it is the sub-day window honoring
 * them (`halfDayRange`). A `full` event — and a legacy `full` event whose notes
 * still carry stray markers — keeps its full-day window, but its stored
 * UTC-midnight instants are realigned to the SGT civil day (`utcMidnightToSgt`)
 * so day-based events share the same wall-clock basis as half-day and timed
 * windows.
 */
export function effectiveEventWindow(
  event: Pick<
    ClashEventInput,
    "timeOption" | "startAmPm" | "endAmPm" | "allDay" | "start" | "end"
  >,
): { start: Date; end: Date } {
  if (event.timeOption === "half" && event.startAmPm && event.endAmPm) {
    const endDate = subOneDay(utcToDateString(event.end));
    return halfDayRange(utcToDateString(event.start), endDate, event.startAmPm, event.endAmPm);
  }
  if (event.allDay) {
    return { start: utcMidnightToSgt(event.start), end: utcMidnightToSgt(event.end) };
  }
  return { start: event.start, end: event.end };
}

/**
 * The instants a candidate event would occupy, honoring the same half-day rule
 * as `effectiveEventWindow` (for a `half` candidate, `start`/`end` are the
 * all-day instants the mutation would write, so the same UTC-midnight basis
 * applies). A `full` candidate's UTC-midnight window is realigned to the SGT
 * civil day exactly like an existing full-day event.
 */
export function effectiveCandidateWindow(
  candidate: Pick<ClashCandidateInput, "start" | "end" | "timeOption" | "startAmPm" | "endAmPm">,
): { start: Date; end: Date } {
  if (candidate.timeOption === "half" && candidate.startAmPm && candidate.endAmPm) {
    const endDate = subOneDay(utcToDateString(candidate.end));
    return halfDayRange(
      utcToDateString(candidate.start),
      endDate,
      candidate.startAmPm,
      candidate.endAmPm,
    );
  }
  if (candidate.timeOption === "full") {
    return { start: utcMidnightToSgt(candidate.start), end: utcMidnightToSgt(candidate.end) };
  }
  return { start: candidate.start, end: candidate.end };
}

/**
 * Build the department → active member map used by every busy-set expansion
 * from a flat list of active roster users (users without a department belong
 * to nothing and are only reachable as explicit creators/invitees). Pure.
 */
export function buildActiveMembersByDepartment(
  users: readonly ClashRosterUser[],
): ActiveMembersByDepartment {
  const members = new Map<string, string[]>();
  for (const user of users) {
    if (!user.departmentId) {
      continue;
    }
    const list = members.get(user.departmentId);
    if (list) {
      list.push(user.id);
    } else {
      members.set(user.departmentId, [user.id]);
    }
  }
  return members;
}

/**
 * The distinct users an event occupies, expanding tagged departments to their
 * active members. An event carrying no people at all occupies the active
 * members of its own calendar (`calendarId`) — the department-row rule for
 * external/people-less copies. Pure.
 */
export function busyUsersOfEvent(
  event: ClashEventInput,
  activeMembersByDepartment: ActiveMembersByDepartment,
): ReadonlySet<string> {
  if (event.excludeFromClash) {
    return new Set<string>();
  }
  const people = event.people;
  const hasPeople =
    people.creatorId !== null || people.userIds.length > 0 || people.departmentIds.length > 0;
  const busy = new Set<string>();
  if (!hasPeople) {
    for (const userId of activeMembersByDepartment.get(event.calendarId) ?? []) {
      busy.add(userId);
    }
    return busy;
  }
  for (const userId of people.userIds) {
    busy.add(userId);
  }
  for (const departmentId of people.departmentIds) {
    for (const userId of activeMembersByDepartment.get(departmentId) ?? []) {
      busy.add(userId);
    }
  }
  return busy;
}

/**
 * The candidate's occupied users: each tagged user on the active roster plus
 * every active member of each tagged department. The organizer is included
 * only when they tagged themselves as an attendee (or belong to a tagged
 * department). Returns id → the department id it came through (null for
 * explicitly tagged users). Unknown/synthetic ids (e.g. the phone-less
 * bootstrap admin) and deactivated users are never affected. Pure.
 */
export function candidateUsers(
  candidate: ClashCandidateInput,
  activeUserIds: ReadonlySet<string>,
  activeMembersByDepartment: ActiveMembersByDepartment,
): Map<string, string | null> {
  const users = new Map<string, string | null>();
  const addExplicit = (userId: string) => {
    if (activeUserIds.has(userId) && !users.has(userId)) {
      users.set(userId, null);
    }
  };
  for (const userId of candidate.inviteeUserIds) {
    addExplicit(userId);
  }
  for (const departmentId of candidate.inviteeDepartments) {
    for (const userId of activeMembersByDepartment.get(departmentId) ?? []) {
      if (!users.has(userId)) {
        users.set(userId, departmentId);
      }
    }
  }
  return users;
}

/**
 * Compute the candidate's clashes against the given existing events. Events
 * that overlap the candidate window and occupy at least one candidate user
 * produce one entry each. Multiple copies of the same logical event (same
 * group id) collapse to a single entry; legacy/external events (no group id)
 * stay per copy. Only active roster users are ever considered affected (see
 * `candidateUsers`), so unknown/synthetic ids never count.
 *
 * The candidate's *own* existing copies (when editing) must be excluded by
 * the caller before this is invoked — the engine has no notion of self.
 */
export function computeClashes(params: {
  candidate: ClashCandidateInput;
  events: readonly ClashEventInput[];
  /** Active roster users; drives both membership expansion and the affected set. */
  activeUsers: readonly ClashRosterUser[];
}): ClashComputation {
  const { candidate, events, activeUsers } = params;
  if (candidate.excludeFromClash) {
    return { checkedPeople: 0, clashes: [] };
  }
  const membersByDepartment = buildActiveMembersByDepartment(activeUsers);
  const activeUserIds = new Set(activeUsers.map((user) => user.id));
  const affected = candidateUsers(candidate, activeUserIds, membersByDepartment);
  const candidateWindow = effectiveCandidateWindow(candidate);

  // One accumulation slot per dedup key (logical event, else the raw copy).
  const byKey = new Map<string, { event: ClashEventInput; affected: Set<string> }>();

  for (const event of events) {
    const window = effectiveEventWindow(event);
    if (!instantWindowsOverlap(candidateWindow.start, candidateWindow.end, window.start, window.end)) {
      continue;
    }
    const busy = busyUsersOfEvent(event, membersByDepartment);
    const shared = new Set<string>();
    for (const userId of affected.keys()) {
      if (busy.has(userId)) {
        shared.add(userId);
      }
    }
    if (shared.size === 0) {
      continue;
    }
    const dedupeKey = event.eventId ?? `${event.calendarId}:${event.googleEventId}`;
    const slot = byKey.get(dedupeKey);
    if (slot) {
      for (const userId of shared) {
        slot.affected.add(userId);
      }
    } else {
      byKey.set(dedupeKey, { event, affected: shared });
    }
  }

  const clashes: EventClash[] = [];
  for (const { event, affected } of byKey.values()) {
    clashes.push({
      copyId: `${event.calendarId}:${event.googleEventId}`,
      eventId: event.eventId,
      calendarId: event.calendarId,
      googleEventId: event.googleEventId,
      calendarName: event.calendarName,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      external: event.external,
      affectedUserIds: [...affected].sort(),
      typeName: event.typeName ?? null,
      typeShortname: event.typeShortname ?? null,
      rawTitle: event.rawTitle ?? null,
      color: event.color ?? "gray",
      occupiesFullDay: event.occupiesFullDay ?? event.timeOption === "full",
      timeOption: event.timeOption,
      startAmPm: event.startAmPm,
      endAmPm: event.endAmPm,
    });
  }
  clashes.sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() ||
      a.calendarName.localeCompare(b.calendarName) ||
      a.title.localeCompare(b.title),
  );

  return { checkedPeople: affected.size, clashes };
}

/**
 * One detected double-booking for a scanned user: a maximal set of events that
 * all occupy that user and that form one connected component of the pairwise
 * time-overlap graph. Any event in the group overlaps at least one other event
 * in the group (so the user really is double-booked somewhere within it), but
 * not necessarily every other one — a chain A↔B↔C is reported as one group.
 */
export interface UserClashGroup {
  /** The overlapping occupying events, chronological then by calendar/title. */
  events: ClashEventInput[];
  /**
   * Roster users occupied by *every* event in the group (always includes the
   * scanned user) — people genuinely double-booked somewhere in the stretch.
   * Sorted.
   */
  sharedUserIds: string[];
}

export interface UserClashScan {
  /** One group per distinct clash episode, chronological by earliest event. */
  groups: UserClashGroup[];
}

/**
 * Existing-event double-booking scan for a single target user (the "Double
 * Booking" page, see docs/user-clashes.md). Unlike `computeClashes` there is
 * no candidate: an event is relevant when it *occupies* the target user, and
 * two relevant events clash when their windows overlap — they share the target
 * by construction. Events that do not occupy the target are ignored even when
 * they overlap (e.g. a colleague's separate absence on the same calendar).
 *
 * The caller reads only the target's own department calendar, which is where
 * every event occupying them carries a copy. Multiple copies of the same
 * logical event (same group id) collapse to one; legacy/external events (no
 * group id) stay per copy. Only active roster users are ever occupied, so a
 * deactivated/unknown target scans to nothing. Pure.
 */
export function findUserClashGroups(params: {
  targetUserId: string;
  events: readonly ClashEventInput[];
  /** Active roster users; drives membership expansion and the occupied set. */
  activeUsers: readonly ClashRosterUser[];
}): UserClashScan {
  const { targetUserId, events, activeUsers } = params;
  const activeUserIds = new Set(activeUsers.map((user) => user.id));
  if (!activeUserIds.has(targetUserId)) {
    return { groups: [] };
  }
  const membersByDepartment = buildActiveMembersByDepartment(activeUsers);

  // Keep only events that occupy the target, merging logical copies (same
  // group id) into one slot with the union of their occupied users.
  const byKey = new Map<string, { event: ClashEventInput; busy: Set<string> }>();
  for (const event of events) {
    const busy = busyUsersOfEvent(event, membersByDepartment);
    if (!busy.has(targetUserId)) {
      continue;
    }
    const dedupeKey = event.eventId ?? `${event.calendarId}:${event.googleEventId}`;
    const slot = byKey.get(dedupeKey);
    if (slot) {
      for (const userId of busy) {
        slot.busy.add(userId);
      }
    } else {
      byKey.set(dedupeKey, { event, busy: new Set(busy) });
    }
  }

  const occupying = [...byKey.values()];
  // Union-find over the pairwise time-overlap graph.
  const parent = occupying.map((_, index) => index);
  const find = (node: number): number => {
    let root = node;
    while (parent[root] !== root) {
      root = parent[root];
    }
    while (parent[node] !== root) {
      const next = parent[node];
      parent[node] = root;
      node = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent[rootB] = rootA;
    }
  };
  for (let i = 0; i < occupying.length; i++) {
    for (let j = i + 1; j < occupying.length; j++) {
      const a = effectiveEventWindow(occupying[i].event);
      const b = effectiveEventWindow(occupying[j].event);
      if (instantWindowsOverlap(a.start, a.end, b.start, b.end)) {
        union(i, j);
      }
    }
  }

  const membersByRoot = new Map<number, number[]>();
  for (let i = 0; i < occupying.length; i++) {
    const root = find(i);
    const list = membersByRoot.get(root);
    if (list) {
      list.push(i);
    } else {
      membersByRoot.set(root, [i]);
    }
  }

  const groups: UserClashGroup[] = [];
  for (const members of membersByRoot.values()) {
    if (members.length < 2) {
      continue;
    }
    const group = members.map((index) => occupying[index]);
    group.sort(
      (a, b) =>
        a.event.start.getTime() - b.event.start.getTime() ||
        a.event.calendarName.localeCompare(b.event.calendarName) ||
        a.event.title.localeCompare(b.event.title),
    );
    const shared = new Set<string>();
    let first = true;
    for (const { busy } of group) {
      if (first) {
        for (const userId of busy) {
          shared.add(userId);
        }
        first = false;
      } else {
        for (const userId of [...shared]) {
          if (!busy.has(userId)) {
            shared.delete(userId);
          }
        }
      }
    }
    groups.push({
      events: group.map(({ event }) => event),
      sharedUserIds: [...shared].sort(),
    });
  }
  groups.sort((a, b) => a.events[0].start.getTime() - b.events[0].start.getTime());

  return { groups };
}
