import { cookies } from "next/headers";

import { listEventTypes } from "@/lib/eventTypes/queries";
import { formatInstantToNaive, monthsInRange, weekDays } from "@/lib/events/datetime";
import {
  fetchMonthEvents,
  fetchRangeEvents,
  getUserDepartmentId,
  listCalendars,
} from "@/lib/events/queries";
import { filterUserOptionIds } from "@/lib/filters/filterUserOptions";
import { googleCalendarConfigured } from "@/lib/google";
import { listUsers } from "@/lib/roster/queries";
import { formatFullName } from "@/lib/settings/formatName";
import { getSettings } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { UI_STATE_COOKIE, decodeUiState, normalizePinnedViews } from "@/lib/ui/uiState";
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

  // Deep link from a Google Calendar event's "Edit:" note; the `date` param in
  // the same link makes the fetched month cover the event's day.
  const initialEditEventId =
    typeof params.edit === "string" && isUuid(params.edit) ? params.edit : null;

  // Per-device remembered UI state: where the URL is silent, the last rendered
  // view/filters apply, so a cold open (or F5) lands where the user left off —
  // resolved here, before first paint, with no client redirect. URL params
  // always win; the cookie is skipped entirely for the one-shot `_fresh`
  // marker (a render that just removed remembered keys — Clear, tab switch)
  // and for `edit` deep links (an explicit intent to see one event).
  const freshRender = typeof params._fresh === "string";
  const cookieState = decodeUiState((await cookies()).get(UI_STATE_COOKIE)?.value);
  const uiState = freshRender || initialEditEventId !== null ? null : cookieState;
  const ui = uiState?.dashboard;
  // Pinned tabs are not URL-backed, so the `_fresh`/`edit` cookie skip above
  // must not drop them — every tab switch is a `_fresh` render, and skipping
  // the cookie there would wipe the pin list on the very next switch.
  const pinnedViews = normalizePinnedViews(cookieState?.dashboard?.pinnedViews);

  const viewParam = params.view ?? ui?.view;
  const view =
    viewParam === "schedule"
      ? "schedule"
      : viewParam === "week"
        ? "week"
        : viewParam === "weekv2"
          ? "weekv2"
          : viewParam === "agenda"
            ? "agenda"
            : "month";

  const urlDate =
    typeof params.date === "string" && DATE_PATTERN.test(params.date) ? params.date : null;
  const cookieDate = typeof ui?.date === "string" && DATE_PATTERN.test(ui.date) ? ui.date : null;
  // A remembered `date` only anchors the day views (Week, Week v2, Day,
  // Agenda); in Month view the remembered month — not a remembered day —
  // drives the read.
  const dateParam = urlDate ?? (view === "month" ? null : cookieDate);

  // The day/week views are anchored on a single day; when `date` is present the
  // month is derived from it so the fetched events always cover the day shown.
  const urlMonth =
    typeof params.month === "string" && MONTH_PATTERN.test(params.month) ? params.month : null;
  const cookieMonth =
    typeof ui?.month === "string" && MONTH_PATTERN.test(ui.month) ? ui.month : null;
  const month =
    dateParam !== null ? dateParam.slice(0, 7) : (urlMonth ?? cookieMonth ?? currentMonth());
  const date = dateParam ?? formatInstantToNaive(new Date()).slice(0, 10);

  // One-shot force-refresh nonce (dashboard refresh button): for this render
  // only, bypass the cache freshness window and block on fresh Google reads.
  // The client strips the param right after the forced render.
  const refreshNonce = typeof params.refresh === "string" ? Number(params.refresh) : NaN;
  const forceRefresh =
    Number.isFinite(refreshNonce) && new Date().getTime() - refreshNonce < REFRESH_NONCE_TTL_MS;

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
  // No `cal` in the URL: the remembered selection (validated like a URL param,
  // so stale ids drop) wins over the role default.
  const cookieCal = ui?.cal ?? [];
  const selectedCalendars =
    params.cal !== undefined
      ? calParam.filter((id) => calendarIds.includes(id))
      : cookieCal.length > 0
        ? cookieCal.filter((id) => calendarIds.includes(id))
        : defaultCalendars;

  const typeNames = eventTypes.map((type) => type.name);
  const eventTypeOptions = eventTypes.map((type) => ({
    name: type.name,
    shortname: type.shortname,
    timeOptions: type.timeOptions,
    locationPolicy: type.locationPolicy,
  }));
  const typesParam =
    typeof params.types === "string" ? params.types.split(",").filter(Boolean) : [];
  const selectedTypes =
    params.types !== undefined
      ? typesParam.filter((name) => typeNames.includes(name))
      : (ui?.types ?? []).filter((name) => typeNames.includes(name));

  const allUserIds = allUsers.map((user) => user.id);
  const usersParam =
    typeof params.users === "string" ? params.users.split(",").filter(Boolean) : [];
  const selectedUsers =
    params.users !== undefined
      ? usersParam.filter((id) => allUserIds.includes(id))
      : (ui?.users ?? []).filter((id) => allUserIds.includes(id));

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

  // The full active roster for the Users-filter row build: a selected user
  // gets a row even when their department is outside the selected calendars.
  const allActiveUsers = activeUsers.map((user) => ({
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
  // other departments' users and "My Events" still works cross-department.
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

  // The week views (Week, Week v2) are anchored on a day and display the full
  // Monday-first week containing it, which can span two months (Google month
  // reads are month-keyed), so those months are fetched and merged in one
  // range read.
  const week = view === "week" || view === "weekv2" ? weekDays(date) : null;
  const events = week
    ? await fetchRangeEvents({
        months: monthsInRange(week[0], week[6]),
        calendarIds: selectedCalendars,
        typeFilter: selectedTypes,
        userFilter: selectedUsers,
        force: forceRefresh,
      })
    : await fetchMonthEvents({
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
      pinnedViews={pinnedViews}
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
      allActiveUsers={allActiveUsers}
      inviteeDepartments={inviteeDepartments}
      inviteeUsers={inviteeUsers}
      filterUsers={filterUsers}
      peopleNames={peopleNames}
      calendarNames={calendarNames}
    />
  );
}
