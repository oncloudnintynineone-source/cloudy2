/** Minimal shapes needed to count a department's in-camp personnel. */
export interface HeadcountUser {
  id: string;
}

export interface HeadcountEvent {
  id: string;
}

/** A department section of the parade-state tree (direct users + sub-sections). */
export interface HeadcountDepartmentNode<T extends HeadcountUser = HeadcountUser> {
  users: readonly T[];
  children: readonly HeadcountDepartmentNode<T>[];
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

/**
 * Headcount of a department including every sub-department below it: the
 * direct headcount plus the aggregated headcount of each child.
 */
export function departmentTreeHeadcount<T extends HeadcountUser>(
  node: HeadcountDepartmentNode<T>,
  eventsByUser: ReadonlyMap<string, readonly HeadcountEvent[]>,
): { total: number; present: number } {
  const { total, present } = departmentHeadcount(node.users, eventsByUser);
  let subtreeTotal = total;
  let subtreePresent = present;
  for (const child of node.children) {
    const sub = departmentTreeHeadcount(child, eventsByUser);
    subtreeTotal += sub.total;
    subtreePresent += sub.present;
  }
  return { total: subtreeTotal, present: subtreePresent };
}