import type { UserStatus } from "@/lib/roster/validate";

/** Minimal shape of a roster user needed to compute filter dialog options. */
export interface FilterUserSource {
  id: string;
  status: UserStatus;
  department: { id: string } | null;
}

/**
 * Ids offered by a filter dialog's Users group: the caller's row ids plus, when
 * present in the roster and not already included, the current user — so the
 * "My Events" quick action keeps working and renders with a real label even on
 * departments the user is not in. (The dashboard passes every active user, so
 * its list does not move with the Calendars filter; Parade State passes the
 * users in the current calendar scope.)
 *
 * `keepUserIds` (the dialog's currently applied picks) are always included too:
 * the option list can shrink under an applied selection (a user later
 * deactivated, a narrowed scope), and a stored pick with no option would
 * otherwise be invisible — no chip to read, no badge to untick — while still
 * filtering the view.
 */
export function filterUserOptionIds(params: {
  users: readonly FilterUserSource[];
  rowUserIds: readonly string[];
  currentUserId: string;
  keepUserIds?: readonly string[];
}): string[] {
  const { users, rowUserIds, currentUserId, keepUserIds = [] } = params;
  const rosterIds = new Set(users.map((user) => user.id));
  const ids = [...new Set([...rowUserIds, ...keepUserIds])].filter((id) => rosterIds.has(id));
  if (ids.includes(currentUserId)) {
    return ids;
  }
  return rosterIds.has(currentUserId) ? [...ids, currentUserId] : ids;
}
