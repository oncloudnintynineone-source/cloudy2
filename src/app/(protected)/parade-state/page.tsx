import { PageContainer } from "@/components/PageContainer";
import { formatInstantToNaive } from "@/lib/events/datetime";
import { fetchMonthEvents, listCalendars } from "@/lib/events/queries";
import { filterUserOptionIds } from "@/lib/filters/filterUserOptions";
import { listUsers } from "@/lib/roster/queries";
import { formatFullName } from "@/lib/settings/formatName";
import { getSettings } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";
import { getUserPreferences } from "@/lib/userPrefs/queries";
import { ParadeStateView } from "./ParadeStateView";
import { scopeParadeUsers } from "./scopeUsers";

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

  // The Parade Calendars/Users filters are stored server-side per account
  // (src/lib/userPrefs) so they follow the user across devices. The day is
  // deliberately NOT remembered (unlike the dashboard): a bare /parade-state
  // always opens on today; only an explicit ?date= wins.
  const prefs = await getUserPreferences(session.user.id);

  const urlDate =
    typeof params.date === "string" && DATE_PATTERN.test(params.date) ? params.date : null;
  const dateParam = urlDate ?? today();
  const month = dateParam.slice(0, 7);

  const [calendars, allUsers, settings] = await Promise.all([
    listCalendars(),
    listUsers(),
    getSettings(),
  ]);

  const calendarIds = calendars.map((calendar) => calendar.id);
  const departmentParentById = new Map(
    calendars.map((calendar) => [calendar.id, calendar.parentId ?? null]),
  );

  // Every role opens on every department; narrowing is purely opt-in via the
  // Calendars filter (an empty remembered list = all departments).
  const rememberedCal = prefs?.paradeCal ?? [];
  const selectedCalendars =
    rememberedCal.length > 0
      ? rememberedCal.filter((id) => calendarIds.includes(id))
      : calendarIds;

  const allUserIds = allUsers.map((user) => user.id);
  const selectedUsers = (prefs?.paradeUsers ?? []).filter((id) => allUserIds.includes(id));

  const events = await fetchMonthEvents({
    month,
    calendarIds: selectedCalendars,
    typeFilter: [],
    userFilter: selectedUsers,
  });

  const activeUsers = allUsers.filter((user) => user.status === "active");
  const visibleUsers = scopeParadeUsers(activeUsers, calendarIds, selectedCalendars, selectedUsers);

  // Filter-dialog user options: the users in the current calendar scope (no
  // user narrowing, so the Users filter can be changed) plus the current user.
  const scopedRowUsers = scopeParadeUsers(activeUsers, calendarIds, selectedCalendars, []);
  const filterUserIds = filterUserOptionIds({
    users: allUsers,
    rowUserIds: scopedRowUsers.map((user) => user.id),
    currentUserId: session.user.id,
  });
  const filterUsers = allUsers
    .filter((user) => filterUserIds.includes(user.id))
    .map((user) => ({
      id: user.id,
      name: user.name,
      displayName: formatFullName(
        { name: user.name, departmentName: user.department?.name ?? null },
        settings.nameTemplate,
      ),
      departmentName: user.department?.name ?? null,
      departmentSort: user.department?.sortOrder ?? null,
      departmentId: user.department?.id ?? null,
      departmentParentId: user.department?.id
        ? (departmentParentById.get(user.department.id) ?? null)
        : null,
    }));

  return (
    <PageContainer>
      <ParadeStateView
        date={dateParam}
        month={month}
        users={visibleUsers.map((user) => ({
          id: user.id,
          name: user.name,
          shortname: user.shortname,
          department: user.department
            ? {
                id: user.department.id,
                name: user.department.name,
                sortOrder: user.department.sortOrder,
              }
            : null,
        }))}
        events={events}
        calendars={calendars.map((calendar) => ({
          id: calendar.id,
          name: calendar.name,
          sortOrder: calendar.sortOrder,
          parentId: calendar.parentId,
        }))}
        currentUser={session.user.id}
        selectedCalendarIds={selectedCalendars}
        selectedUserIds={selectedUsers}
        filterUsers={filterUsers}
        nameTemplate={settings.nameTemplate}
        isAdmin={session.user.role === "admin"}
      />
    </PageContainer>
  );
}
