/**
 * Pure logic behind the "Department access" editor of the user modal.
 *
 * The editor **stages** grant rows and applies them on Save, so every edit of
 * the staged list is a pure list operation: dedupe, drop the user's own
 * department (membership already shares it), keep the department-tree display
 * order, and resolve the one row that is not a grant row at all — the override
 * of the user's *own* department's ACL level, which has no column of its own
 * and is therefore applied with the rest of the save (`docs/roster-sharing.md`
 * §1.5).
 *
 * Client-safe on purpose: no DB/Google imports, so the modal and the unit
 * tests can both import it.
 */

import type { ManagedGrantRole, UserCalendarGrant } from "./shares";

/** Narrow a raw string (a Select value) to an access level. */
export function isAccessRole(value: string | null | undefined): value is ManagedGrantRole {
  return value === "reader" || value === "writer" || value === "owner";
}

/**
 * Departments the "Add departments" dialog may offer: everything in the tree
 * except the user's own department (membership already shares it, so a grant
 * row for it would be a no-op the server strips anyway) and except the ones
 * already staged. Keeps the `orderedIds` (department-tree) order.
 */
export function addableDepartmentIds(
  orderedIds: readonly string[],
  ownDepartmentId: string | null,
  current: readonly UserCalendarGrant[],
): string[] {
  const staged = new Set(current.map((grant) => grant.calendarId));
  return orderedIds.filter((id) => id !== ownDepartmentId && !staged.has(id));
}

/**
 * Stable order for staged rows: department-tree display order, with unknown
 * ids (a department deleted while the modal was open) kept last in their
 * existing relative order.
 */
export function sortGrantsByTreeOrder(
  grants: readonly UserCalendarGrant[],
  orderedIds: readonly string[],
): UserCalendarGrant[] {
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  const last = Number.MAX_SAFE_INTEGER;
  return [...grants].sort(
    (a, b) => (rank.get(a.calendarId) ?? last) - (rank.get(b.calendarId) ?? last),
  );
}

/**
 * Add picked departments as `reader` rows. Already-staged rows keep the level
 * the admin set (re-adding never resets it); the result is deduped and back in
 * tree order.
 */
export function nextGrantsAfterAdd(
  current: readonly UserCalendarGrant[],
  addedIds: readonly string[],
  orderedIds: readonly string[],
): UserCalendarGrant[] {
  const byId = new Map<string, ManagedGrantRole>();
  for (const grant of current) {
    if (!byId.has(grant.calendarId)) byId.set(grant.calendarId, grant.role);
  }
  for (const id of addedIds) {
    if (!byId.has(id)) byId.set(id, "reader");
  }
  const grants = [...byId].map(([calendarId, role]) => ({ calendarId, role }));
  return sortGrantsByTreeOrder(grants, orderedIds);
}

/** Change a staged row's level; unknown rows are ignored. */
export function setGrantRole(
  current: readonly UserCalendarGrant[],
  calendarId: string,
  role: ManagedGrantRole,
): UserCalendarGrant[] {
  return current.map((grant) => (grant.calendarId === calendarId ? { ...grant, role } : grant));
}

/** Remove a staged row; unknown rows are ignored. */
export function removeGrant(
  current: readonly UserCalendarGrant[],
  calendarId: string,
): UserCalendarGrant[] {
  return current.filter((grant) => grant.calendarId !== calendarId);
}

export interface OwnRolePatchInput {
  /**
   * The live ACL level of the department the user belonged to when the modal
   * opened, or `null` when it could not be read (no email yet, Google off, or
   * the read failed).
   */
  seededRole: ManagedGrantRole | null;
  /** The level picked in this modal, or `null` when the row was left alone. */
  stagedRole: ManagedGrantRole | null;
  /** Whether the form currently carries an email to grant to. */
  hasEmail: boolean;
  /** Whether the department changed in this same edit. */
  departmentChanged: boolean;
}

/**
 * Decide what to do with the own-department override on Save.
 *
 * `null` means "send nothing" — the row was never touched, or there is no
 * address to grant to. After a department change `seededRole` describes the
 * *old* department, so any explicit pick counts as a change (the new
 * department's level is what gets written; the old department's override is
 * dropped by the reconcile). With no read to compare against, an explicit pick
 * is applied as asked.
 */
export function resolveOwnRolePatch({
  seededRole,
  stagedRole,
  hasEmail,
  departmentChanged,
}: OwnRolePatchInput): ManagedGrantRole | null {
  if (stagedRole === null || !hasEmail) return null;
  if (departmentChanged) return stagedRole;
  return stagedRole === seededRole ? null : stagedRole;
}

/** "3 departments" / "1 department" — the summary chip on a user card. */
export function grantSummaryLabel(count: number): string {
  return count === 1 ? "1 department" : `${count} departments`;
}
