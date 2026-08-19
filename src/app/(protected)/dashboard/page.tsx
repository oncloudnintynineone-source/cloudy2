import { listEventTypes } from "@/lib/eventTypes/queries";
import { formatInstantToNaive } from "@/lib/events/datetime";
import { fetchMonthEvents, getUserDepartmentId, listCalendars } from "@/lib/events/queries";
import { filterUserOptionIds } from "@/lib/filters/filterUserOptions";
import { googleCalendarConfigured } from "@/lib/google";
import { listUsers } from "@/lib/roster/queries";
import { formatFullName } from "@/lib/settings/formatName";
import { getSettings } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { DashboardView } from "./DashboardView";

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// The one-shot force-refresh nonce is honored only within this window, so a
// stale history entry (back/forward) can't silently re-force a fetch.
const REFRESH_NONCE_TTL_MS = 5 * 60_000;

function currentMonth(): string {
  return formatInstantToNaive(new Date()).slice(0, 7);
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const isAdmin = session.user.role === "admin";

  const view =
    params.view === "mobile" ? "mobile" : params.view === "schedule" ? "schedule" : "month";

  const dateParam =
    typeof params.date === "string" && DATE_PATTERN.test(params.date) ? params.date : null;

  // The schedule view is anchored on a single day; when `date` is present the
  // month is derived from it so the fetched events always cover the day shown.
  const month =
    dateParam !== null
      ? dateParam.slice(0, 7)
      : typeof params.month === "string" && MONTH_PATTERN.test(params.month)
        ? params.month
        : currentMonth();
  const date = dateParam ?? formatInstantToNaive(new Date()).slice(0, 10);

  // One-shot force-refresh nonce (dashboard refresh button): for this render
  // only, bypass the cache freshness window and block on fresh Google reads.
  // The client strips the param right after the forced render.
  const refreshNonce = typeof params.refresh === "string" ? Number(params.refresh) : NaN;
  const forceRefresh =
    Number.isFinite(refreshNonce) && new Date().getTime() - refreshNonce < REFRESH_NONCE_TTL_MS;

  // Deep link from a Google Calendar event's "Edit:" note; the `date` param in
  // the same link makes the fetched month cover the event's day.
  const initialEditEventId =
    typeof params.edit === "string" && isUuid(params.edit) ? params.edit : null;

  const [calendars, eventTypes, allUsers, settings] = await Promise.all([
    listCalendars(),
    listEventTypes(),
    listUsers(),
    getSettings(),
  ]);
  const calendarIds = calendars.map((calendar) => calendar.id);

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
  const eventTypeOptions = eventTypes.map((type) => ({
    name: type.name,
    shortname: type.shortname,
    timeOptions: type.timeOptions,
  }));
  const typesParam =
    typeof params.types === "string" ? params.types.split(",").filter(Boolean) : [];
  const selectedTypes =
    params.types === undefined
      ? []
      : typesParam.filter((name) => typeNames.includes(name));

  const allUserIds = allUsers.map((user) => user.id);
  const usersParam =
    typeof params.users === "string" ? params.users.split(",").filter(Boolean) : [];
  const selectedUsers =
    params.users === undefined ? [] : usersParam.filter((id) => allUserIds.includes(id));

  // Schedule view rows: active users whose department is among the selected
  // calendars. Invitee picker options are role-scoped: admins can tag any
  // department/user, regular users only their own department.
  const activeUsers = allUsers.filter((user) => user.status === "active");
  const ownUsers = ownDepartmentId
    ? activeUsers.filter((user) => user.department?.id === ownDepartmentId)
    : [];
  const pickerUsers = isAdmin ? activeUsers : ownUsers;

  const scheduleUsers = activeUsers
    .filter((user) => user.department && selectedCalendars.includes(user.department.id))
    .map((user) => ({
      id: user.id,
      name: user.name,
      shortname: user.shortname,
      departmentId: user.department ? user.department.id : null,
    }));

  const inviteeUsers = pickerUsers.map((user) => ({
    id: user.id,
    name: user.name,
    shortname: user.shortname,
    departmentName: user.department?.name ?? null,
    displayName: formatFullName(
      { name: user.name, departmentName: user.department?.name ?? null },
      settings.nameTemplate,
    ),
  }));

  // Filter dialog user options: the users in view (schedule rows of the
  // selected departments) plus the current user, so a non-admin can filter
  // other departments' users and "Only me" still works cross-department.
  const filterUserIds = filterUserOptionIds({
    users: allUsers,
    rowUserIds: scheduleUsers.map((user) => user.id),
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

  const inviteeDepartments = (
    isAdmin ? calendars : calendars.filter((calendar) => calendar.id === ownDepartmentId)
  ).map((calendar) => ({ id: calendar.id, name: calendar.name }));

  const peopleNames: Record<string, string> = Object.fromEntries(
    pickerUsers.map((user) => [
      user.id,
      formatFullName(
        { name: user.name, departmentName: user.department?.name ?? null },
        settings.nameTemplate,
      ),
    ]),
  );
  const calendarNames: Record<string, string> = Object.fromEntries(
    calendars.map((calendar) => [calendar.id, calendar.name]),
  );

  const events = await fetchMonthEvents({
    month,
    calendarIds: selectedCalendars,
    typeFilter: selectedTypes,
    userFilter: selectedUsers,
    force: forceRefresh,
  });

  return (
    <DashboardView
      month={month}
      date={date}
      view={view}
      events={events}
      calendars={calendars.map((calendar) => ({ id: calendar.id, name: calendar.name }))}
      eventTypes={eventTypeOptions}
      eventTitleTemplate={settings.eventTitleTemplate}
      googleConfigured={googleCalendarConfigured()}
      selectedCalendarIds={selectedCalendars}
      selectedTypes={selectedTypes}
      selectedUserIds={selectedUsers}
      currentUser={session.user.id}
      isAdmin={isAdmin}
      initialEditEventId={initialEditEventId}
      scheduleUsers={scheduleUsers}
      inviteeDepartments={inviteeDepartments}
      inviteeUsers={inviteeUsers}
      filterUsers={filterUsers}
      peopleNames={peopleNames}
      calendarNames={calendarNames}
    />
  );
}
