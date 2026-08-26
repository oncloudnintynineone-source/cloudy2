/** Minimal user shape needed to scope the parade-state row set. */
export interface ParadeUserScope {
  id: string;
  department: { id: string; name: string } | null;
}

/**
 * Users shown in the parade-state view after the Calendars and Users filters
 * are applied.
 *
 * Calendar scope: a selection that is empty or covers every calendar is "no
 * narrowing" and shows everyone, including the unassigned group (both roles
 * default to all calendars, so the page opens on every department). A proper
 * subset keeps only users in the selected departments and hides unassigned
 * users. User scope: an empty selection is "no filter"; otherwise a user must
 * be among the selected ids. Roster order is preserved.
 */
export function scopeParadeUsers<T extends ParadeUserScope>(
  users: readonly T[],
  calendarIds: readonly string[],
  selectedCalendarIds: readonly string[],
  selectedUserIds: readonly string[],
): T[] {
  const narrowsCalendar =
    selectedCalendarIds.length > 0 && selectedCalendarIds.length < calendarIds.length;
  return users.filter(
    (user) =>
      (!narrowsCalendar ||
        (user.department !== null && selectedCalendarIds.includes(user.department.id))) &&
      (selectedUserIds.length === 0 || selectedUserIds.includes(user.id)),
  );
}
