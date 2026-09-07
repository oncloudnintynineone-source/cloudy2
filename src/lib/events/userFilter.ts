/**
 * Pure helper for the dashboard "Users" filter: an event applies to a user
 * when that user is a tagged attendee of it (matching the schedule view's
 * personal rows — see `rowsForEvent` in ./schedule). The organizer is matched
 * only when they tagged themselves as an attendee: creating an event for
 * others does not make it "theirs" in a personal view, and an organizer who is
 * merely owning an event gets no personal row for it. Department-tagged events
 * are not matched: they stay reachable via the calendar filter.
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
  return people.inviteeUserIds.some((userId) => selectedUserIds.includes(userId));
}
