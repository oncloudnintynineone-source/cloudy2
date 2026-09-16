/**
 * Pure helper for the dashboard "Users" filter: an event applies to a user
 * when that user is a tagged attendee of it, or an **active member of one of
 * the event's tagged departments** (matching the schedule view's personal rows
 * and the clash occupancy model — see `rowsForEvent` in ./schedule). The
 * organizer is matched only when they tagged themselves as an attendee:
 * creating an event for others does not make it "theirs" in a personal view,
 * and an organizer who is merely owning an event gets no personal row for it.
 * Kept free of I/O for unit testing.
 */

export interface EventPeopleRef {
  creatorId: string | null;
  inviteeUserIds: string[];
  inviteeDepartmentIds: string[];
}

/**
 * Whether a logical event applies to at least one of the selected users.
 *
 * `memberships` maps a tagged department (calendar) id to its active member
 * user ids. Without it, only individually tagged attendees match (callers that
 * have no roster data fall back to attendee-only matching).
 */
export function eventMatchesUserFilter(
  people: EventPeopleRef,
  selectedUserIds: string[],
  memberships?: ReadonlyMap<string, string[]>,
): boolean {
  if (people.inviteeUserIds.some((userId) => selectedUserIds.includes(userId))) {
    return true;
  }
  if (!memberships || people.inviteeDepartmentIds.length === 0) {
    return false;
  }
  for (const departmentId of people.inviteeDepartmentIds) {
    const members = memberships.get(departmentId);
    if (members?.some((userId) => selectedUserIds.includes(userId))) {
      return true;
    }
  }
  return false;
}
