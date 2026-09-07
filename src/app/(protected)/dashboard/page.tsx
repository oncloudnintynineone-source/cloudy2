import { cookies } from "next/headers";

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
import { requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";
import { clampZoom } from "@/lib/ui/slotZoom";
import { UI_STATE_COOKIE, decodeUiState } from "@/lib/ui/uiState";
import { getDashboardViews } from "@/lib/dashboardViews/queries";
import {
  emptyTabFilters,
  resolveActiveTab,
  type DashboardTabFilters,
  type DashboardViewTab,
} from "@/lib/dashboardViews/views";
import { getUserPreferences } from "@/lib/userPrefs/queries";
import { DashboardView } from "./DashboardView";

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// The one-shot force-refresh nonce is honored only within this window, so a
// stale history entry (back/forward) can't silently re-force a fetch.
const REFRESH_NONCE_TTL_MS = 5 * 60_000;

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

function currentMonth(): string {
  return formatInstantToNaive(new Date()).slice(0, 7);
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const isAdmin = session.user.role === "admin";

  // Deep link that auto-opens the event's edit form (the event search modal's
  // "Edit" action); the `date` param in the same link makes the fetched month
  // cover the event's day.
  const initialEditEventId =
    typeof params.edit === "string" && isUuid(params.edit) ? params.edit : null;

  // Deep link that auto-opens the event's details modal: a Google Calendar
  // event's "Edit:" note, the Pinned Events agenda, or an event search result.
  // The dashboard opens the details (edit/duplicate/delete) once the fetched
  // events include a copy.
  const initialDetailEventId =
    typeof params.event === "string" && isUuid(params.event) ? params.event : null;

  // On-demand dashboard tabs are stored server-side per account. The active
  // tab is resolved: URL `?view=<tab id>` wins (a legacy `?view=<kind>`
  // string maps to the first tab of that kind), else the remembered
  // last-active tab (server-side), else the first tab in strip order. The
  // page renders whichever tab the URL/remembered state selects; the tab's
  // kind picks the renderer, its filters resolve to the fetch below.
  const urlView =
    typeof params.view === "string" && params.view.length > 0 ? params.view : null;
  const storedTabs = await getDashboardViews(session.user.id);
  const prefs = await getUserPreferences(session.user.id);
  const canManageViews = storedTabs.length > 0;
  const tabs = storedTabs.length > 0 ? storedTabs : [STATIC_DEFAULT_TAB];
  const activeTab =
    resolveActiveTab(urlView, prefs?.dashboardActiveViewId ?? null, tabs) ?? STATIC_DEFAULT_TAB;
  const view = activeTab.kind;

  // Per-device "where you are" state: where the URL is silent, the last
  // rendered date/month anchor (and Day/Week (H) zoom) apply, so a cold open
  // (or F5) lands where the user left off. URL params always win.
  const cookieState = decodeUiState((await cookies()).get(UI_STATE_COOKIE)?.value);
  const nav = cookieState?.dashboard;
  // Timeline zoom (Day/Week (H)) is not URL-backed, so it is read from the raw
  // cookie and resolved before first paint to avoid a width jump on cold open.
  const initialZoom = clampZoom(nav?.zoom) ?? 1;

  const urlDate =
    typeof params.date === "string" && DATE_PATTERN.test(params.date) ? params.date : null;
  const cookieDate = typeof nav?.date === "string" && DATE_PATTERN.test(nav.date) ? nav.date : null;
  // A remembered `date` only anchors the day views (Week (H), Week (D), Day,
  // Agenda); in Month view the remembered month — not a remembered day —
  // drives the read.
  const dateParam = urlDate ?? (view === "month" ? null : cookieDate);

  // The day/week views are anchored on a single day; when `date` is present the
  // month is derived from it so the fetched events always cover the day shown.
  const urlMonth =
    typeof params.month === "string" && MONTH_PATTERN.test(params.month) ? params.month : null;
  const cookieMonth =
    typeof nav?.month === "string" && MONTH_PATTERN.test(nav.month) ? nav.month : null;
  const month =
    dateParam !== null ? dateParam.slice(0, 7) : (urlMonth ?? cookieMonth ?? currentMonth());
  const date = dateParam ?? formatInstantToNaive(new Date()).slice(0, 10);

  // One-shot force-refresh nonce (profile-menu "Force refresh"): the client
  // hard-reloads the current URL with `?refresh=<epoch-ms>`. For this render
  // only, bypass the cache freshness window and block on fresh Google reads.
  // The global useOneShotRefreshStrip (AppShellShell) strips the param right
  // after the forced render mounts.
  const refreshNonce = typeof params.refresh === "string" ? Number(params.refresh) : NaN;
  const forceRefresh =
    Number.isFinite(refreshNonce) && new Date().getTime() - refreshNonce < REFRESH_NONCE_TTL_MS;

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

  // Dashboard filter state — stored per tab server-side. Each of the active
  // tab's three filters is `null` ("role default") or an explicit array. The
  // arrays are re-validated against live data here (exactly like the URL
  // params they replaced), THEN dropped when all-stale. An explicit EMPTY
  // array survives — it records "this tab cleared that filter" and must keep
  // resolving to nothing, not to the role default.
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

  // `?event=` deep links (Google Calendar "Edit:" notes, Pinned Events, event
  // search): `_eventCal` carries the target event's calendar, which the
  // resolved filters may exclude (the links can target any calendar, whatever
  // the user's active tab/filter selection). Add it to the read only — the
  // filter selection (`selectedCalendars`, which drives the filter UI and the
  // remembered state) stays untouched.
  const eventCalParam =
    typeof params._eventCal === "string" && calendarIds.includes(params._eventCal)
      ? params._eventCal
      : null;
  const fetchCalendarIds =
    eventCalParam && !selectedCalendars.includes(eventCalParam)
      ? [...selectedCalendars, eventCalParam]
      : selectedCalendars;

  // Schedule view rows: active users whose department is among the selected
  // calendars. Invitee picker options are the full active roster for every
  // role: non-admins may invite users from any department (and tag any
  // department) — the event copies then land in the invitees' departments.
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
    departmentSort: user.department?.sortOrder ?? null,
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
      name: user.name,
      departmentName: user.department?.name ?? null,
      departmentSort: user.department?.sortOrder ?? null,
    }));

  const inviteeDepartments = calendars.map((calendar) => ({
    id: calendar.id,
    name: calendar.name,
    sortOrder: calendar.sortOrder,
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

  // The week views (Week (H), Week (D)) are anchored on a day and display the full
  // Monday-first week containing it, which can span two months (Google month
  // reads are month-keyed), so those months are fetched and merged in one
  // range read. The Month view likewise displays a full 6-week grid whose
  // adjacent-month days carry events, so it range-reads those months too
  // (2-3 via monthGridMonths); Day/Agenda stay single-month.
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
          force: forceRefresh,
        })
      : await fetchMonthEvents({
          month,
          calendarIds: fetchCalendarIds,
          typeFilter: selectedTypes,
          userFilter: selectedUsers,
          force: forceRefresh,
        });

  // Display-only per-view title: re-render each internal event via the
  // kind-assigned template (fallback to master). External events keep Google
  // title. Assignments stay keyed by renderer kind (all tabs of a kind share
  // the template the settings UI assigns to that kind).
  const templateMapForDisplay = new Map(
    eventTitleTemplates.map((t) => [t.id, t.template] as const),
  );
  const viewTemplate =
    (settings.eventTitleTemplateAssignments as Record<string, string>)[view] &&
    templateMapForDisplay.get(
      (settings.eventTitleTemplateAssignments as Record<string, string>)[view],
    )
      ? templateMapForDisplay.get(
          (settings.eventTitleTemplateAssignments as Record<string, string>)[view],
        )!
      : settings.eventTitleTemplate;

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
    masterTemplate: settings.eventTitleTemplate,
    assignments: settings.eventTitleTemplateAssignments as Record<string, string>,
    templates: eventTitleTemplates.map((t) => ({ id: t.id, label: t.label, template: t.template })),
    usersById,
    eventTypesByName,
    calendarsById,
  });

  return (
    <DashboardView
      month={month}
      date={date}
      tabs={tabs}
      activeView={activeTab}
      canManageViews={canManageViews}
      initialZoom={initialZoom}
      events={events}
      calendars={calendars.map((calendar) => ({
        id: calendar.id,
        name: calendar.name,
        sortOrder: calendar.sortOrder,
      }))}
      eventTypes={eventTypeOptions}
      eventTypeGroups={eventTypeGroupOptions}
      eventTitleTemplate={settings.eventTitleTemplate}
      viewEventTitleTemplate={viewTemplate}
      googleConfigured={googleCalendarConfigured()}
      // Only enabled links reach the client; an empty list hides the
      // quick-links launcher on the Calendar page entirely.
      quickLinks={quickLinks
        .filter((link) => link.enabled)
        .map((link) => ({
          id: link.id,
          label: link.label,
          url: link.url,
          icon: link.icon,
          color: link.color,
        }))}
      selectedCalendarIds={selectedCalendars}
      selectedTypes={selectedTypes}
      selectedUserIds={selectedUsers}
      defaultFilters={defaultFilters}
      currentUser={session.user.id}
      isAdmin={isAdmin}
      currentUserName={session.user.name ?? ""}
      initialEditEventId={initialEditEventId}
      initialDetailEventId={initialDetailEventId}
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
