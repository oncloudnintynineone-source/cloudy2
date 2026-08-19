import { listEventTypes } from "@/lib/eventTypes/queries";
import { formatInstantToNaive } from "@/lib/events/datetime";
import { fetchMonthEvents, getUserDepartmentId, listCalendars } from "@/lib/events/queries";
import { filterUserOptionIds } from "@/lib/filters/filterUserOptions";
import { googleCalendarConfigured } from "@/lib/google";
import { listUsers } from "@/lib/roster/queries";
import { formatFullName } from "@/lib/settings/formatName";
import { getSettings } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";
import { ParadeStateView } from "./ParadeStateView";

interface ParadeStatePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  return formatInstantToNaive(new Date()).slice(0, 10);
}

export default async function ParadeStatePage({ searchParams }: ParadeStatePageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const isAdmin = session.user.role === "admin";

  const dateParam =
    typeof params.date === "string" && DATE_PATTERN.test(params.date) ? params.date : today();
  const month = dateParam.slice(0, 7);

  const [calendars, eventTypes, allUsers, settings] = await Promise.all([
    listCalendars(),
    listEventTypes(),
    listUsers(),
    getSettings(),
  ]);
  const calendarIds = calendars.map((calendar) => calendar.id);

  const ownDepartmentId = isAdmin ? null : await getUserDepartmentId(session.user.id);
  const defaultCalendars = isAdmin ? calendarIds : ownDepartmentId ? [ownDepartmentId] : [];

  const calParam = typeof params.cal === "string" ? params.cal.split(",").filter(Boolean) : [];
  const selectedCalendars =
    params.cal === undefined ? defaultCalendars : calParam.filter((id) => calendarIds.includes(id));

  const typeNames = eventTypes.map((type) => type.name);
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

  const activeUsers = allUsers.filter((user) => user.status === "active");

  const filterUserIds = filterUserOptionIds({
    users: allUsers,
    rowUserIds: activeUsers.map((user) => user.id),
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
    <ParadeStateView
      date={dateParam}
      month={month}
      users={activeUsers.map((user) => ({
        id: user.id,
        name: user.name,
        shortname: user.shortname,
        department: user.department,
      }))}
      events={events}
      calendars={calendars.map((calendar) => ({ id: calendar.id, name: calendar.name }))}
      eventTypes={eventTypes.map((type) => ({ name: type.name, shortname: type.shortname ?? "" }))}
      googleConfigured={googleCalendarConfigured()}
      currentUser={session.user.id}
      isAdmin={isAdmin}
      selectedCalendarIds={selectedCalendars}
      selectedTypes={selectedTypes}
      selectedUserIds={selectedUsers}
      filterUsers={filterUsers}
      nameTemplate={settings.nameTemplate}
    />
  );
}
