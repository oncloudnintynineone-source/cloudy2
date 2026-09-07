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

/** A named node of the parade-state tree, as flattened into summary rows. */
export interface HeadcountSummaryNode<T extends HeadcountUser = HeadcountUser> {
  name: string;
  users: readonly T[];
  children: readonly HeadcountSummaryNode<T>[];
}

/** One line of the headcount summary: a section in tree order. */
export interface DepartmentSummaryRow {
  name: string;
  depth: number;
  present: number;
  total: number;
}

export interface DepartmentSummary {
  rows: DepartmentSummaryRow[];
  total: { present: number; total: number };
}

/**
 * Flatten the parade-state tree into the read-only headcount summary shown
 * above the roster: sections in tree order (parents before children, in the
 * given order), skipping sections whose subtree has no users so the summary
 * matches exactly what the body renders. Each row's `present`/`total` cover
 * the section's own subtree — a parent row already includes every
 * sub-department below it, and those sub-departments are then listed as
 * deeper rows underneath. `total` is the headcount over every top-level
 * section (a pure tree-wide aggregate, not the sum of the rows).
 */
export function departmentSummaryRows<T extends HeadcountUser>(
  sections: readonly HeadcountSummaryNode<T>[],
  isPresent: (userId: string) => boolean,
): DepartmentSummary {
  const rows: DepartmentSummaryRow[] = [];

  // Subtree aggregates per section (own users + every descendant), computed
  // once per section and reused so the preorder emit below stays O(n).
  const aggregates = new Map<HeadcountSummaryNode<T>, { present: number; total: number }>();
  const compute = (section: HeadcountSummaryNode<T>): { present: number; total: number } => {
    const cached = aggregates.get(section);
    if (cached) return cached;
    let present = 0;
    let total = 0;
    for (const user of section.users) {
      total += 1;
      if (isPresent(user.id)) present += 1;
    }
    for (const child of section.children) {
      const sub = compute(child);
      total += sub.total;
      present += sub.present;
    }
    const aggregate = { present, total };
    aggregates.set(section, aggregate);
    return aggregate;
  };

  // Preorder emit: a parent row (whole-subtree aggregate) before its
  // sub-departments, skipping sections whose subtree has no users so the
  // summary mirrors exactly what the body renders.
  const emit = (section: HeadcountSummaryNode<T>, depth: number) => {
    const aggregate = compute(section);
    if (aggregate.total === 0) return;
    rows.push({ name: section.name, depth, present: aggregate.present, total: aggregate.total });
    for (const child of section.children) {
      emit(child, depth + 1);
    }
  };

  let totalUsers = 0;
  let totalPresent = 0;
  for (const section of sections) {
    emit(section, 0);
    const sub = compute(section);
    totalUsers += sub.total;
    totalPresent += sub.present;
  }

  return { rows, total: { present: totalPresent, total: totalUsers } };
}