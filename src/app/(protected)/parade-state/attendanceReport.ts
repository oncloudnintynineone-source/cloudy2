/** Minimal shapes needed to render the attendance-mode clipboard report. */
export interface AttendanceReportUser {
  id: string;
  name: string;
}

export interface AttendanceReportDepartment {
  name: string;
  users: readonly AttendanceReportUser[];
}

/**
 * Textual parade state for the attendance-mode "Copy to Clipboard" action.
 *
 * Departments render in the given order (page order: A→Z, Unassigned last)
 * and empty departments are skipped. Each department gets a
 * `<name> (<checked> of <total>)` header, then one line per user in the given
 * order: unchecked users get a ` - Absent` suffix; checked users render bare —
 * checking overrides everything else (no event tags, no absent), whatever the
 * user's calendar says. Departments are separated by a blank line.
 */
export function buildAttendanceReport(
  departments: readonly AttendanceReportDepartment[],
  checkedIds: ReadonlySet<string>,
): string {
  const blocks = departments
    .filter((dept) => dept.users.length > 0)
    .map((dept) => {
      const checked = dept.users.filter((user) => checkedIds.has(user.id)).length;
      const lines = dept.users.map((user) =>
        checkedIds.has(user.id) ? user.name : `${user.name} - Absent`,
      );
      return [`${dept.name} (${checked} of ${dept.users.length})`, ...lines].join("\n");
    });
  return blocks.join("\n\n");
}
