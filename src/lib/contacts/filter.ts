/**
 * Pure helper for the Contacts page's search + department filter. Kept free of
 * I/O so it can be unit-tested without a DB.
 */

import type { RosterUser } from "@/lib/roster/queries";

/**
 * Sentinel department id selecting contacts who have no department. Real
 * calendar ids are UUIDs, so the token can never collide with one.
 */
export const NO_DEPARTMENT_FILTER = "no-department";

/**
 * Narrow a roster to the contacts matching the free-text `query` (name,
 * shortname, or phone) AND the selected `departmentIds`. An empty department
 * list means "no department filter". The `NO_DEPARTMENT_FILTER` sentinel
 * matches users whose direct department is null.
 */
export function filterContacts(
  users: readonly RosterUser[],
  query: string,
  departmentIds: readonly string[] = [],
): RosterUser[] {
  const q = query.trim().toLowerCase();
  const selected = new Set(departmentIds);
  const filterByDepartment = selected.size > 0;

  return users.filter((user) => {
    if (q !== "") {
      const matchesQuery =
        user.name.toLowerCase().includes(q) ||
        (user.shortname?.toLowerCase().includes(q) ?? false) ||
        user.phone.includes(q);
      if (!matchesQuery) {
        return false;
      }
    }

    if (filterByDepartment) {
      const departmentId = user.department?.id;
      const matchesDepartment = departmentId
        ? selected.has(departmentId)
        : selected.has(NO_DEPARTMENT_FILTER);
      if (!matchesDepartment) {
        return false;
      }
    }

    return true;
  });
}
