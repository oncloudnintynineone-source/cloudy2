/**
 * Pure helper for the dashboard "Users" filter: an event applies to a user
 * when that user created it or is tagged on it (matching the schedule view's
 * personal rows — see `rowsForEvent` in ./schedule). Department-tagged
 * events are not matched: they stay reachable via the calendar filter.
 * Kept free of I/O for unit testing.
 */

export interface EventPeopleRef {
  creatorId: string | null;
  inviteeUserIds: string[];
}

/** Whether a logical event applies to at least one of the selected users. */
export function eventMatchesUserFilter(
  people: EventPeopleRef,
  selectedUserIds: string[],
): boolean {
  if (people.creatorId && selectedUserIds.includes(people.creatorId)) {
    return true;
  }
  return people.inviteeUserIds.some((userId) => selectedUserIds.includes(userId));
}
