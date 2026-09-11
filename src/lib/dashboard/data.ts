/**
 * Server-side builder for the dashboard snapshot.
 *
 * This is the resolution the Calendar page used to run inline in `page.tsx`:
 * session + remembered device state + stored tabs/filters + the month/range
 * event read, reduced to a serializable snapshot. The route now renders a thin
 * client shell and this builder is invoked by the `loadDashboardData` server
 * action so the client can revalidate in the background while showing the last
 * on-device snapshot (docs/pwa-offline.md).
 */

import { cookies } from "next/headers";
import type { Session } from "next-auth";

import { listEventTypes, listEventTypeGroups } from "@/lib/eventTypes/queries";
import {
  formatInstantToNaive,
  monthGridMonths,
  monthsInRange,
  weekDays,
} from "@/lib/events/datetime";
import {
  fetchMonthEvents,
  fetchRangeEvents,
  getUserDepartmentId,
  listCalendars,
} from "@/lib/events/queries";
import { filterUserOptionIds } from "@/lib/filters/filterUserOptions";
import { googleCalendarConfigured } from "@/lib/google";
import { listQuickLinks } from "@/lib/quickLinks/queries";
import { listUsers } from "@/lib/roster/queries";
import { resolveDisplayTitles } from "@/lib/events/eventTitleDisplay";
import { formatFullName } from "@/lib/settings/formatName";
import { getSettings, listEventTitleTemplates } from "@/lib/settings/queries";
import { UI_STATE_COOKIE, decodeUiState } from "@/lib/ui/uiState";
import { getDashboardViews } from "@/lib/dashboardViews/queries";
import {
  emptyTabFilters,
  resolveActiveTab,
  type DashboardTabFilters,
  type DashboardViewTab,
} from "@/lib/dashboardViews/views";
import { getUserPreferences } from "@/lib/userPrefs/queries";
import { dashboardRequestKey, type DashboardSnapshot } from "./snapshot";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// The break-glass admin session has no `users` row (id "admin"), so it has no
// stored views; it renders this static single Month view, and the UI hides all
// view management. Same fallback for any account whose stored views somehow
// failed to seed.
const STATIC_DEFAULT_TAB: DashboardViewTab = {
  id: "default",
  kind: "month",
  name: "Month",
  sortOrder: 0,
  filters: emptyTabFilters(),
};

export interface BuildDashboardDataInput {
  view: string | null;
  month: string | null;
  date: string | null;
  edit: string | null;
  event: string | null;
  eventCal: string | null;
  /** Bypass the events cache freshness window and block on fresh Google reads. */
  force: boolean;
}

export interface BuiltDashboardData {
  data: DashboardSnapshot;
  month: string;
  date: string;
  viewId: string;
  requestKey: string;
}

function currentMonth(): string {
  return formatInstantToNaive(new Date()).slice(0, 7);
}

export async function buildDashboardData(
  input: BuildDashboardDataInput,
  session: Session,
): Promise<BuiltDashboardData> {
  const isAdmin = session.user.role === "admin";

  const urlView = input.view && input.view.length > 0 ? input.view : null;
  const storedTabs = await getDashboardViews(session.user.id);
  const prefs = await getUserPreferences(session.user.id);
  const canManageViews = storedTabs.length > 0;
  const tabs = storedTabs.length > 0 ? storedTabs : [STATIC_DEFAULT_TAB];
  const activeTab =
    resolveActiveTab(urlView, prefs?.dashboardActiveViewId ?? null, tabs) ?? STATIC_DEFAULT_TAB;
  const view = activeTab.kind;

  // Per-device "where you are" state: where the URL is silent, the last
  // rendered date/month anchor applies, so a cold open (or F5) lands where the
  // user left off. URL params always win.
  const cookieState = decodeUiState((await cookies()).get(UI_STATE_COOKIE)?.value);
  const nav = cookieState?.dashboard;

  const urlDate = input.date && DATE_PATTERN.test(input.date) ? input.date : null;
  const cookieDate =
    typeof nav?.date === "string" && DATE_PATTERN.test(nav.date) ? nav.date : null;
  const dateParam = urlDate ?? (view === "month" ? null : cookieDate);

  const urlMonth = input.month && MONTH_PATTERN.test(input.month) ? input.month : null;
  const cookieMonth =
    typeof nav?.month === "string" && MONTH_PATTERN.test(nav.month) ? nav.month : null;
  const month =
    dateParam !== null ? dateParam.slice(0, 7) : (urlMonth ?? cookieMonth ?? currentMonth());
  const date = dateParam ?? formatInstantToNaive(new Date()).slice(0, 10);

  const [
    calendars,
    eventTypes,
    eventTypeGroups,
    allUsers,
    settings,
    quickLinks,
    eventTitleTemplates,
  ] = await Promise.all([
    listCalendars(),
    listEventTypes(),
    listEventTypeGroups(),
    listUsers(),
    getSettings(),
    listQuickLinks(),
    listEventTitleTemplates(),
  ]);
  const calendarIds = calendars.map((calendar) => calendar.id);
  const departmentParentById = new Map(
    calendars.map((calendar) => [calendar.id, calendar.parentId ?? null]),
  );

  const ownDepartmentId = isAdmin ? null : await getUserDepartmentId(session.user.id);
  const defaultCalendars = isAdmin ? calendarIds : ownDepartmentId ? [ownDepartmentId] : [];

  const typeNames = eventTypes.map((type) => type.name);
  const eventTypeOptions = eventTypes.map((type) => ({
    name: type.name,
    shortname: type.shortname,
    groupId: type.groupId,
    timeOptions: type.timeOptions,
    allowedLocations: type.allowedLocations,
    showRemarks: type.showRemarks,
    showInvitees: type.showInvitees,
    showLocation: type.showLocation,
    color: type.color,
  }));
  const eventTypeGroupOptions = eventTypeGroups.map((group) => ({
    id: group.id,
    name: group.name,
    sortOrder: group.sortOrder,
  }));
  const allUserIds = allUsers.map((user) => user.id);

  const validCal = (ids: string[] | undefined): string[] | undefined => {
    if (ids === undefined) return undefined;
    const list = ids.filter((id) => calendarIds.includes(id));
    return list.length > 0 || ids.length === 0 ? list : undefined;
  };
  const validUsers = (ids: string[] | undefined): string[] | undefined => {
    if (ids === undefined) return undefined;
    const list = (ids ?? []).filter((id) => allUserIds.includes(id));
    return list.length > 0 || ids.length === 0 ? list : undefined;
  };
  const validTypes = (names: string[] | undefined): string[] | undefined => {
    if (names === undefined) return undefined;
    const list = (names ?? []).filter((name) => typeNames.includes(name));
    return list.length > 0 || names.length === 0 ? list : undefined;
  };
  const resolveFilter = (
    stored: string[] | null,
    validator: (ids: string[] | undefined) => string[] | undefined,
    fallback: string[],
  ): string[] => (stored === null ? fallback : (validator(stored) ?? fallback));

  const selectedCalendars = resolveFilter(activeTab.filters.cal, validCal, defaultCalendars);
  const selectedUsers = resolveFilter(activeTab.filters.users, validUsers, []);
  const selectedTypes = resolveFilter(activeTab.filters.types, validTypes, []);
  const defaultFilters: DashboardTabFilters = {
    cal: defaultCalendars,
    users: [],
    types: [],
  };

  // `?event=` deep links: `_eventCal` carries the target event's calendar,
  // which the resolved filters may exclude. Add it to the read only — the
  // filter selection stays untouched.
  const eventCalParam =
    input.eventCal && calendarIds.includes(input.eventCal) ? input.eventCal : null;
  const fetchCalendarIds =
    eventCalParam && !selectedCalendars.includes(eventCalParam)
      ? [...selectedCalendars, eventCalParam]
      : selectedCalendars;

  const activeUsers = allUsers.filter((user) => user.status === "active");
  const pickerUsers = activeUsers;

  const scheduleUsers = activeUsers
    .filter((user) => user.department && selectedCalendars.includes(user.department.id))
    .map((user) => ({
      id: user.id,
      name: user.name,
      shortname: user.shortname,
      departmentId: user.department ? user.department.id : null,
    }));

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
    departmentSort: user.department?.sortOrder ?? null,
    departmentId: user.department?.id ?? null,
    departmentParentId: user.department?.id
      ? (departmentParentById.get(user.department.id) ?? null)
      : null,
    displayName: formatFullName(
      { name: user.name, departmentName: user.department?.name ?? null },
      settings.nameTemplate,
    ),
  }));

  const filterUserIds = filterUserOptionIds({
    users: allUsers,
    rowUserIds: scheduleUsers.map((user) => user.id),
    currentUserId: session.user.id,
  });
  const filterUsers = allUsers
    .filter((user) => filterUserIds.includes(user.id))
    .map((user) => ({
      id: user.id,
      name: user.name,
      departmentName: user.department?.name ?? null,
      departmentSort: user.department?.sortOrder ?? null,
      departmentId: user.department?.id ?? null,
      departmentParentId: user.department?.id
        ? (departmentParentById.get(user.department.id) ?? null)
        : null,
    }));

  const inviteeDepartments = calendars.map((calendar) => ({
    id: calendar.id,
    name: calendar.name,
    sortOrder: calendar.sortOrder,
    parentId: calendar.parentId,
  }));

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

  const week = view === "week" || view === "weekv2" ? weekDays(date) : null;
  const rangeMonths = week
    ? monthsInRange(week[0], week[6])
    : view === "month"
      ? monthGridMonths(month)
      : [month];
  const rawEvents =
    rangeMonths.length > 1
      ? await fetchRangeEvents({
          months: rangeMonths,
          calendarIds: fetchCalendarIds,
          typeFilter: selectedTypes,
          userFilter: selectedUsers,
          force: input.force,
        })
      : await fetchMonthEvents({
          month,
          calendarIds: fetchCalendarIds,
          typeFilter: selectedTypes,
          userFilter: selectedUsers,
          force: input.force,
        });

  const templateMapForDisplay = new Map(
    eventTitleTemplates.map((t) => [t.id, t.recipe] as const),
  );
  const assignments = settings.eventTitleTemplateAssignments as Record<string, string>;
  const assignedRecipe = assignments[view] ? templateMapForDisplay.get(assignments[view]) : undefined;
  const viewRecipe = assignedRecipe ?? settings.eventTitleRecipe;

  const usersById = new Map(
    allUsers.map((u) => [
      u.id,
      {
        id: u.id,
        name: u.name,
        shortname: u.shortname,
        departmentName: u.department?.name ?? null,
      },
    ]),
  );
  const eventTypesByName = new Map(
    eventTypes.map((t) => [t.name, { name: t.name, shortname: t.shortname }]),
  );
  const calendarsById = new Map(calendars.map((c) => [c.id, c.name]));
  const events = resolveDisplayTitles(rawEvents, {
    view,
    nameTemplate: settings.nameTemplate,
    masterRecipe: settings.eventTitleRecipe,
    assignments,
    templates: eventTitleTemplates.map((t) => ({ id: t.id, label: t.label, recipe: t.recipe })),
    usersById,
    eventTypesByName,
    calendarsById,
  });

  const data: DashboardSnapshot = {
    tabs,
    activeView: activeTab,
    canManageViews,
    events,
    calendars: calendars.map((calendar) => ({
      id: calendar.id,
      name: calendar.name,
      sortOrder: calendar.sortOrder,
      parentId: calendar.parentId,
    })),
    eventTypes: eventTypeOptions,
    eventTypeGroups: eventTypeGroupOptions,
    eventTitleRecipe: settings.eventTitleRecipe,
    viewEventTitleRecipe: viewRecipe,
    googleConfigured: googleCalendarConfigured(),
    quickLinks: quickLinks
      .filter((link) => link.enabled)
      .map((link) => ({
        id: link.id,
        label: link.label,
        url: link.url,
        icon: link.icon,
        color: link.color,
      })),
    selectedCalendarIds: selectedCalendars,
    selectedTypes,
    selectedUserIds: selectedUsers,
    defaultFilters,
    currentUser: session.user.id,
    isAdmin,
    scheduleUsers,
    allActiveUsers,
    inviteeDepartments,
    inviteeUsers,
    filterUsers,
    peopleNames,
    calendarNames,
    currentUserName: session.user.name ?? "",
  };

  // The deep-link ids are not part of the snapshot (they are URL state), so
  // `input.edit`/`input.event` are intentionally unused here; they are resolved
  // client-side from the current search params.

  return {
    data,
    month,
    date,
    viewId: activeTab.id,
    requestKey: dashboardRequestKey({
      view: input.view,
      month: input.month,
      date: input.date,
    }),
  };
}
