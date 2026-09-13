/**
 * Pure department-section builder for the parade-state view and the daily
 * parade-state email. Buckets users by their direct department, walks the
 * department hierarchy, and appends the terminal "Unassigned" section — so
 * both consumers render the exact same tree. Kept free of I/O.
 */

import { buildDepartmentTree, type DepartmentTreeNode } from "@/lib/roster/hierarchy";

/** The minimum user shape needed to bucket into a department section. */
export interface ParadeSectionUser {
  id: string;
  department: { id: string } | null;
}

/** A department section: direct users plus nested sub-sections. */
export interface ParadeSection<T extends ParadeSectionUser = ParadeSectionUser> {
  id: string | null;
  name: string;
  users: T[];
  children: ParadeSection<T>[];
}

/** The minimum calendar shape needed to build the hierarchy. */
export interface ParadeCalendar {
  id: string;
  name: string;
  sortOrder?: number;
  parentId: string | null;
}

/**
 * Build the department sections in hierarchy order (parents before children,
 * by the shared sortOrder), each carrying its direct users; "Unassigned" stays
 * a terminal top-level section.
 */
export function buildParadeSections<T extends ParadeSectionUser>(
  users: readonly T[],
  calendars: readonly ParadeCalendar[],
): ParadeSection<T>[] {
  const usersByDept = new Map<string, T[]>();
  const unassigned: T[] = [];

  for (const user of users) {
    if (user.department) {
      const list = usersByDept.get(user.department.id) ?? [];
      list.push(user);
      usersByDept.set(user.department.id, list);
    } else {
      unassigned.push(user);
    }
  }

  const tree = buildDepartmentTree(
    calendars.map((calendar) => ({
      id: calendar.id,
      name: calendar.name,
      sortOrder: calendar.sortOrder ?? 0,
      parentId: calendar.parentId,
    })),
  );
  const mapNode = (node: DepartmentTreeNode): ParadeSection<T> => ({
    id: node.id,
    name: node.name,
    users: usersByDept.get(node.id) ?? [],
    children: node.children.map(mapNode),
  });

  return [...tree.map(mapNode), { id: null, name: "Unassigned", users: unassigned, children: [] }];
}
