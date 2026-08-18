import { listEventTypes } from "@/lib/eventTypes/queries";
import { formatInstantToNaive } from "@/lib/events/datetime";
import { fetchMonthEvents, getUserDepartmentId, listCalendars } from "@/lib/events/queries";
import { filterUserOptionIds } from "@/lib/filters/filterUserOptions";
import { googleCalendarConfigured } from "@/lib/google";
import { buildOverviewCounts } from "@/lib/overview/counts";
import { overviewRowUserIds } from "@/lib/overview/scope";
import type { RosterUser } from "@/lib/roster/queries";
import { listUsers } from "@/lib/roster/queries";
import { formatFullName } from "@/lib/settings/formatName";
import { getSettings } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";
import { OverviewView } from "./OverviewView";

const UNASSIGNED_DEPARTMENT_ID = "__unassigned__";
const UNASSIGNED_DEPARTMENT_NAME = "Unassigned";

interface OverviewPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function currentMonth(): string {
  return formatInstantToNaive(new Date()).slice(0, 7);
}

export default async function OverviewPage({ searchParams }: OverviewPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const isAdmin = session.user.role === "admin";

  const month =
    typeof params.month === "string" && MONTH_PATTERN.test(params.month)
      ? params.month
      : currentMonth();

  const [calendars, allUsers, eventTypes, settings] = await Promise.all([
    listCalendars(),
    listUsers(),
    listEventTypes(),
    getSettings(),
  ]);
  const calendarIds = calendars.map((calendar) => calendar.id);

  // Role scoping mirrors the dashboard: admins default to the whole org,
  // regular users default to their own department. The filter can narrow
  // either scope (non-admins may pick any department, like the calendar page).
  const ownDepartmentId = isAdmin ? null : await getUserDepartmentId(session.user.id);
  const defaultCalendars = isAdmin
    ? calendarIds
    : ownDepartmentId
      ? [ownDepartmentId]
      : [];

  const calParam = typeof params.cal === "string" ? params.cal.split(",").filter(Boolean) : [];
  const selectedCalendars =
    params.cal === undefined
      ? defaultCalendars
      : calParam.filter((id) => calendarIds.includes(id));

  const typeNames = eventTypes.map((type) => type.name);
  const typeShortnames = Object.fromEntries(
    eventTypes.map((type) => [type.name, type.shortname ?? type.name]),
  );
  const typesParam =
    typeof params.types === "string" ? params.types.split(",").filter(Boolean) : [];
  const selectedTypes =
    params.types === undefined ? [] : typesParam.filter((name) => typeNames.includes(name));

  const allUserIds = allUsers.map((user) => user.id);
  const usersParam =
    typeof params.users === "string" ? params.users.split(",").filter(Boolean) : [];
  const selectedUsers =
    params.users === undefined ? [] : usersParam.filter((id) => allUserIds.includes(id));

  const events = await fetchMonthEvents({
    month,
    calendarIds: selectedCalendars,
    typeFilter: selectedTypes,
    userFilter: selectedUsers,
  });

  // Rows follow the selected departments only (mirroring the dashboard
  // schedule view); the users param narrows events, never rows, so a
  // cross-department filter plus "only me" can no longer intersect to empty.
  const rowUserIds = overviewRowUserIds({
    users: allUsers,
    selectedCalendarIds: selectedCalendars,
    calendarCount: calendars.length,
    isAdmin,
  });
  const rowUsers = allUsers.filter((user) => rowUserIds.includes(user.id));

  const displayedTypeNames = selectedTypes.length > 0 ? selectedTypes : typeNames;
  const counts = buildOverviewCounts({
    events,
    userIds: rowUserIds,
    typeNames: displayedTypeNames,
  });

  const departments = groupByDepartment(rowUsers);

  // Filter dialog options: the users in view (rows of the selected
  // departments) plus the current user, so a non-admin can filter other
  // departments' users and "Only me" still works cross-department.
  const filterUserIds = filterUserOptionIds({
    users: allUsers,
    rowUserIds,
    currentUserId: session.user.id,
  });
  const filterUsers = allUsers
    .filter((user) => filterUserIds.includes(user.id))
    .map((user) => ({
      id: user.id,
      displayName: formatFullName(
        { name: user.name, departmentName: user.department?.name ?? null },
        settings.nameTemplate,
      ),
    }));

  return (
    <OverviewView
      month={month}
      googleConfigured={googleCalendarConfigured()}
      departments={departments}
      typeNames={displayedTypeNames}
      typeShortnames={typeShortnames}
      counts={Object.fromEntries(counts)}
      calendars={calendars.map((calendar) => ({ id: calendar.id, name: calendar.name }))}
      eventTypes={typeNames}
      filterUsers={filterUsers}
      selectedCalendarIds={selectedCalendars}
      selectedTypes={selectedTypes}
      selectedUserIds={selectedUsers}
      currentUser={session.user.id}
    />
  );
}

/**
 * Groups active users under their department (sorted by name, users by name,
 * mirroring the dashboard schedule layout). Users with no department are
 * collected under an "Unassigned" pseudo-department so they stay visible.
 */
function groupByDepartment(users: RosterUser[]): {
  id: string;
  name: string;
  users: { id: string; label: string; fullName: string }[];
}[] {
  const byId = new Map<string, { id: string; name: string; users: { id: string; label: string; fullName: string }[] }>();
  const sorted = [...users].sort((a, b) => a.name.localeCompare(b.name));

  for (const user of sorted) {
    const department = user.department;
    const id = department?.id ?? UNASSIGNED_DEPARTMENT_ID;
    const name = department?.name ?? UNASSIGNED_DEPARTMENT_NAME;
    let group = byId.get(id);
    if (!group) {
      group = { id, name, users: [] };
      byId.set(id, group);
    }
    group.users.push({ id: user.id, label: user.shortname || user.name, fullName: user.name });
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
