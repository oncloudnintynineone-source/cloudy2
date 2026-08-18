import type { UserStatus } from "@/lib/roster/validate";

/** Minimal shape of a roster user needed for overview row scoping. */
export interface OverviewRowUser {
  id: string;
  status: UserStatus;
  department: { id: string } | null;
}

/**
 * Pure row scoping for the Overview page: which users get a matrix row.
 * Rows follow the selected calendars (departments) only — never a users
 * filter — mirroring the dashboard schedule view, where the users param
 * narrows events (see `fetchMonthEvents`' userFilter) but not rows.
 *
 * - Active users only.
 * - Any selection narrows rows to the users of the selected departments —
 *   including a full selection (a non-admin picking every department sees
 *   every department, not their own).
 * - The only special case: an admin with every calendar selected (the default
 *   view, or an explicit full selection) keeps unassigned users visible.
 */
export function overviewRowUserIds(params: {
  users: readonly OverviewRowUser[];
  selectedCalendarIds: readonly string[];
  calendarCount: number;
  isAdmin: boolean;
}): string[] {
  const { users, selectedCalendarIds, calendarCount, isAdmin } = params;
  const active = users.filter((user) => user.status === "active");
  const showEverything = isAdmin && selectedCalendarIds.length === calendarCount;
  const scoped = showEverything
    ? active
    : active.filter(
        (user) => user.department !== null && selectedCalendarIds.includes(user.department.id),
      );
  return scoped.map((user) => user.id);
}
