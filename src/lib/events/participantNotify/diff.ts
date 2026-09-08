/**
 * Pure diff that answers "which roster users were newly added to this event as
 * participants?" for a create/update. Semantics match the event-occupancy model
 * used by the clash engine (`busyUsersOfEvent` in src/lib/events/clashes.ts): a
 * tagged *user* is one participant, and a tagged *department* includes every
 * active member of it (resolved at mutation time through the same membership
 * map the edit guard uses). A user counts as "added" when they are occupied by
 * the after-state but were not occupied by the before-state — so a plain
 * reschedule, a removal, or an unrelated edit adds nobody.
 *
 * The actor who performed the mutation is filtered out by the caller (they
 * already know); this module only answers who is newly included.
 */

export interface ParticipantPeople {
  /** User ids tagged on the event. */
  inviteeUserIds: string[];
  /** Department (calendar) ids tagged on the event. */
  inviteeDepartments: string[];
}

/** Department id → active member ids (the roster snapshot at mutation time). */
export type DepartmentMemberships = ReadonlyMap<string, readonly string[]>;

const EMPTY: readonly string[] = [];

/** Normalize a possibly-malformed id array to a unique ordered list. */
function cleanIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return EMPTY;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.length > 0 && !seen.has(entry)) {
      seen.add(entry);
      out.push(entry);
    }
  }
  return out;
}

/** Members of a tagged department in roster order (unknown dept → none). */
function departmentMemberIds(
  departmentId: string,
  memberships: DepartmentMemberships,
): readonly string[] {
  return memberships.get(departmentId) ?? EMPTY;
}

/** The set of roster users an event occupies, per the clash occupancy model. */
export function occupiedUserIds(
  people: ParticipantPeople | null | undefined,
  memberships: DepartmentMemberships,
): Set<string> {
  const occupied = new Set<string>();
  if (!people) {
    return occupied;
  }
  for (const userId of cleanIds(people.inviteeUserIds)) {
    occupied.add(userId);
  }
  for (const departmentId of cleanIds(people.inviteeDepartments)) {
    for (const memberId of departmentMemberIds(departmentId, memberships)) {
      occupied.add(memberId);
    }
  }
  return occupied;
}

/**
 * The user ids newly occupied by the after-state (added as participants) that
 * the before-state did not occupy. Order is deterministic: added tagged users
 * in their tagged order first, then newly-included department members in
 * department-tag then roster order.
 */
export function computeAddedUserIds(
  before: ParticipantPeople | null | undefined,
  after: ParticipantPeople,
  memberships: DepartmentMemberships,
): string[] {
  const occupiedBefore = occupiedUserIds(before, memberships);
  const added: string[] = [];
  const seen = new Set<string>();
  const consider = (userId: string) => {
    if (occupiedBefore.has(userId) || seen.has(userId)) {
      return;
    }
    seen.add(userId);
    added.push(userId);
  };
  if (after) {
    for (const userId of cleanIds(after.inviteeUserIds)) {
      consider(userId);
    }
    for (const departmentId of cleanIds(after.inviteeDepartments)) {
      for (const memberId of departmentMemberIds(departmentId, memberships)) {
        consider(memberId);
      }
    }
  }
  return added;
}
