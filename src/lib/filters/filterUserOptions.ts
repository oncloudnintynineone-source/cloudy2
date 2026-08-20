import type { UserStatus } from "@/lib/roster/validate";

/** Minimal shape of a roster user needed to compute filter dialog options. */
export interface FilterUserSource {
  id: string;
  status: UserStatus;
  department: { id: string } | null;
}

/**
 * Ids offered by a filter dialog's Users group: the ids of the users in view
 * (the rows of the selected departments) plus, when present in the roster and
 * not already included, the current user — so the "My Events" quick action keeps
 * working and renders with a real label even on departments the user is not in.
 */
export function filterUserOptionIds(params: {
  users: readonly FilterUserSource[];
  rowUserIds: readonly string[];
  currentUserId: string;
}): string[] {
  const { users, rowUserIds, currentUserId } = params;
  const ids = [...rowUserIds];
  if (ids.includes(currentUserId)) {
    return ids;
  }
  return users.some((user) => user.id === currentUserId) ? [...ids, currentUserId] : ids;
}
