/** Minimal shapes needed to render the attendance-mode clipboard report. */
export interface AttendanceReportUser {
  id: string;
  name: string;
  /** Per-event tag strings (via `resolveEventTypeTag`), in card order. */
  eventTags: readonly string[];
}

export interface AttendanceReportDepartment {
  name: string;
  users: readonly AttendanceReportUser[];
}

/**
 * Resolve one event's report tag via the `{type:acronym}` fallback chain:
 * registry shortname → raw type name (unknown to the registry, or blank
 * shortname) → the event title when the event has no type at all.
 */
export function resolveEventTypeTag(
  eventType: string | null,
  title: string,
  acronyms: Record<string, string | null>,
): string {
  if (eventType === null) {
    return title;
  }
  return acronyms[eventType] ?? eventType;
}

/**
 * Textual parade state for the attendance-mode "Copy to Clipboard" action.
 *
 * Departments render in the given order (page order: A→Z, Unassigned last)
 * and empty departments are skipped. Each department gets a
 * `<name> (<checked> of <total>)` header, then one line per user in the given
 * order: unchecked users get a ` - Absent` suffix (even when event-tagged —
 * an unchecked user is absent regardless of their calendar); checked users
 * render bare, or with a ` - (<tags joined ", ">)` suffix when tagged with
 * events. Departments are separated by a blank line.
 */
export function buildAttendanceReport(
  departments: readonly AttendanceReportDepartment[],
  checkedIds: ReadonlySet<string>,
): string {
  const blocks = departments
    .filter((dept) => dept.users.length > 0)
    .map((dept) => {
      const checked = dept.users.filter((user) => checkedIds.has(user.id)).length;
      const lines = dept.users.map((user) => {
        if (!checkedIds.has(user.id)) {
          return `${user.name} - Absent`;
        }
        return user.eventTags.length > 0
          ? `${user.name} - (${user.eventTags.join(", ")})`
          : user.name;
      });
      return [`${dept.name} (${checked} of ${dept.users.length})`, ...lines].join("\n");
    });
  return blocks.join("\n\n");
}
