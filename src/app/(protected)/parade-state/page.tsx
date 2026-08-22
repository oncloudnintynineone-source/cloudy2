import { cookies } from "next/headers";

import { PageContainer } from "@/components/PageContainer";
import { formatInstantToNaive } from "@/lib/events/datetime";
import { fetchMonthEvents, listCalendars } from "@/lib/events/queries";
import { filterUserOptionIds } from "@/lib/filters/filterUserOptions";
import { listUsers } from "@/lib/roster/queries";
import { formatFullName } from "@/lib/settings/formatName";
import { getSettings } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";
import { UI_STATE_COOKIE, decodeUiState } from "@/lib/ui/uiState";
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

  // Per-device remembered UI state, same contract as the dashboard page: URL
  // params win, and the one-shot `_fresh` marker (a render that just removed
  // remembered keys) skips the cookie so a Clear/tab-switch never re-applies
  // the stale values for that one render.
  const freshRender = typeof params._fresh === "string";
  const uiState = freshRender ? null : decodeUiState((await cookies()).get(UI_STATE_COOKIE)?.value);
  const ui = uiState?.parade;

  const urlDate =
    typeof params.date === "string" && DATE_PATTERN.test(params.date) ? params.date : null;
  const cookieDate = typeof ui?.date === "string" && DATE_PATTERN.test(ui.date) ? ui.date : null;
  const dateParam = urlDate ?? cookieDate ?? today();
  const month = dateParam.slice(0, 7);

  const [calendars, allUsers, settings] = await Promise.all([
    listCalendars(),
    listUsers(),
    getSettings(),
  ]);

  const calendarIds = calendars.map((calendar) => calendar.id);

  // Every role opens on every department; narrowing is purely opt-in via the
  // Calendars filter ("all selected" = no filter).
  const calParam = typeof params.cal === "string" ? params.cal.split(",").filter(Boolean) : [];
  const cookieCal = ui?.cal ?? [];
  const selectedCalendars =
    params.cal !== undefined
      ? calParam.filter((id) => calendarIds.includes(id))
      : cookieCal.length > 0
        ? cookieCal.filter((id) => calendarIds.includes(id))
        : calendarIds;

  const allUserIds = allUsers.map((user) => user.id);
  const usersParam =
    typeof params.users === "string" ? params.users.split(",").filter(Boolean) : [];
  const selectedUsers =
    params.users !== undefined
      ? usersParam.filter((id) => allUserIds.includes(id))
      : (ui?.users ?? []).filter((id) => allUserIds.includes(id));

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
      displayName: formatFullName(
        { name: user.name, departmentName: user.department?.name ?? null },
        settings.nameTemplate,
      ),
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
          department: user.department,
        }))}
        events={events}
        calendars={calendars.map((calendar) => ({ id: calendar.id, name: calendar.name }))}
        currentUser={session.user.id}
        selectedCalendarIds={selectedCalendars}
        selectedUserIds={selectedUsers}
        filterUsers={filterUsers}
        nameTemplate={settings.nameTemplate}
      />
    </PageContainer>
  );
}
