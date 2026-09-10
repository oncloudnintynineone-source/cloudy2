/** Minimal shapes needed to render the attendance-mode clipboard report. */
export interface AttendanceReportUser {
  id: string;
  name: string;
}

export interface AttendanceReportDepartment {
  name: string;
  users: readonly AttendanceReportUser[];
  /**
   * Sub-departments. The department's header count includes every user below
   * it (direct + transitive descendants), but its block only lists its own
   * direct users — sub-departments get their own blocks underneath.
   */
  children?: readonly AttendanceReportDepartment[];
}

function aggregateChecked(
  dept: AttendanceReportDepartment,
  checkedIds: ReadonlySet<string>,
): number {
  let count = dept.users.filter((user) => checkedIds.has(user.id)).length;
  for (const child of dept.children ?? []) {
    count += aggregateChecked(child, checkedIds);
  }
  return count;
}

function aggregateTotal(dept: AttendanceReportDepartment): number {
  let count = dept.users.length;
  for (const child of dept.children ?? []) {
    count += aggregateTotal(child);
  }
  return count;
}

/**
 * Textual parade state for the attendance-mode "Copy to Clipboard" action.
 *
 * Departments render as flat blocks in tree order (a department, then its
 * sub-departments depth-first), and departments without direct users are
 * skipped (their people still count toward the ancestor's header). Each block
 * gets a `<name> (<checked> of <total> present)` header where both numbers
 * include every sub-department below it, then one line per direct user in the
 * given order: unchecked users get a ` - Absent` suffix; checked users render
 * bare — checking overrides everything else (no event tags, no absent),
 * whatever the user's calendar says. Blocks are separated by a blank line.
 */
export function buildAttendanceReport(
  departments: readonly AttendanceReportDepartment[],
  checkedIds: ReadonlySet<string>,
): string {
  const blocks: string[] = [];
  const visit = (dept: AttendanceReportDepartment) => {
    if (dept.users.length > 0) {
      const checked = aggregateChecked(dept, checkedIds);
      const total = aggregateTotal(dept);
      const lines = dept.users.map((user) =>
        checkedIds.has(user.id) ? user.name : `${user.name} - Absent`,
      );
      blocks.push([`${dept.name} (${checked} of ${total} present)`, ...lines].join("\n"));
    }
    for (const child of dept.children ?? []) {
      visit(child);
    }
  };
  for (const dept of departments) {
    visit(dept);
  }
  return blocks.join("\n\n");
}
