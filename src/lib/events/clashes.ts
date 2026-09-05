/**
 * Pure clash (double-booking) engine for the event create/edit wizard.
 *
 * Semantics (see docs/event-clashes.md): a calendar event *occupies* the
 * people it affects — its creator, each tagged person, and every active
 * member of each tagged department (a department-level event is an event for
 * everyone within that department). An event with no identifiable people at
 * all (externally created in Google, or a people-less legacy copy) occupies
 * every active member of the department calendar it sits on, mirroring how
 * the schedule view pins such events to their calendar's department row
 * (`expandScheduleEvents` in ./schedule.ts).
 *
 * Two events clash when their time windows overlap AND they share at least
 * one occupied user. The module is pure and unit-tested: all I/O (reading the
 * month cache, resolving the roster) happens in the callers (`clashQuery.ts`,
 * `clashActions.ts`).
 *
 * Kept free of any I/O so it can be unit-tested without a database.
 */

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
  /** People from the notes block: creator, tagged users, tagged departments. */
  people: {
    creatorId: string | null;
    userIds: string[];
    departmentIds: string[];
  };
}

/** The event being created/edited, as the engine sees it. */
export interface ClashCandidateInput {
  /** Absolute start instant. */
  start: Date;
  /** Absolute end instant, exclusive. */
  end: Date;
  /** Effective creator (after `withSelfCreator`); null when unknown. */
  creatorId: string | null;
  /** Effective tagged users (schedule rows). */
  inviteeUserIds: string[];
  /** Effective tagged departments (their active members count as affected). */
  inviteeDepartments: string[];
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
  if (people.creatorId) {
    busy.add(people.creatorId);
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
 * The candidate's occupied users: the creator and each tagged user who is on
 * the active roster, plus every active member of each tagged department.
 * Returns id → the department id it came through (null for the creator/tagged
 * users). Unknown/synthetic ids (e.g. the phone-less bootstrap admin) and
 * deactivated users are never affected. Pure.
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
  if (candidate.creatorId) {
    addExplicit(candidate.creatorId);
  }
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
  const membersByDepartment = buildActiveMembersByDepartment(activeUsers);
  const activeUserIds = new Set(activeUsers.map((user) => user.id));
  const affected = candidateUsers(candidate, activeUserIds, membersByDepartment);

  // One accumulation slot per dedup key (logical event, else the raw copy).
  const byKey = new Map<string, { event: ClashEventInput; affected: Set<string> }>();

  for (const event of events) {
    if (!instantWindowsOverlap(candidate.start, candidate.end, event.start, event.end)) {
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
      calendarName: event.calendarName,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      external: event.external,
      affectedUserIds: [...affected].sort(),
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
