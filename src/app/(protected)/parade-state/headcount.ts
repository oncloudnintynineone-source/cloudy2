/** Minimal shapes needed to count a department's in-camp personnel. */
export interface HeadcountUser {
  id: string;
}

export interface HeadcountEvent {
  id: string;
}

/**
 * How many of a department's personnel are present (in camp) on the selected
 * day: the department size minus everyone who has at least one out-of-camp
 * event. `eventsByUser` carries only out-of-camp events for that day, so a
 * user counts as out of camp exactly when their list is non-empty.
 */
export function departmentHeadcount<T extends HeadcountUser>(
  users: readonly T[],
  eventsByUser: ReadonlyMap<string, readonly HeadcountEvent[]>,
): { total: number; present: number } {
  const total = users.length;
  const present = users.filter((user) => (eventsByUser.get(user.id)?.length ?? 0) === 0).length;
  return { total, present };
}