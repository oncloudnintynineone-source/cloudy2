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
import {
  DASHBOARD_VIEW_VALUES,
  UI_STATE_COOKIE,
  decodeUiState,
  normalizePinnedViews,
  resolveDashboardFilters,
  resolveDashboardView,
  type DashboardViewFilters,
  type DashboardViewValue,
} from "@/lib/ui/uiState";
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

  // Per-device remembered UI state: where the URL is silent, the last rendered
  // view/filters apply, so a cold open (or F5) lands where the user left off —
  // resolved here, before first paint, with no client redirect. URL params
  // always win; the cookie is skipped entirely only for the one-shot `_fresh`
  // marker (a render that just removed remembered keys — Clear, tab switch).
  // `edit`/`event` deep links read the remembered state too (see below), so an
  // event search result or a Google Calendar "Edit:" note opens on the user's
  // own view + filters — the link's `date` pins the fetched period and
  // `_eventCal` adds the event's calendar regardless of the filter selection.
  const freshRender = typeof params._fresh === "string";
  const cookieState = decodeUiState((await cookies()).get(UI_STATE_COOKIE)?.value);
  const uiState = freshRender ? null : cookieState;
  const ui = uiState?.dashboard;
  // Pinned tabs are not URL-backed, so the `_fresh` cookie skip above
  // must not drop them — every tab switch is a `_fresh` render, and skipping
  // the cookie there would wipe the pin list on the very next switch.
  const pinnedViews = normalizePinnedViews(cookieState?.dashboard?.pinnedViews);
  // Timeline zoom (Day/Week (H)) is remembered the same way: not URL-backed,
  // so it is read from the raw cookie (survives `_fresh`) and resolved before
  // first paint to avoid a width jump on cold open.
  const initialZoom = clampZoom(cookieState?.dashboard?.zoom) ?? 1;

  const view = resolveDashboardView(params.view ?? ui?.view);

  const urlDate =
    typeof params.date === "string" && DATE_PATTERN.test(params.date) ? params.date : null;
  const cookieDate = typeof ui?.date === "string" && DATE_PATTERN.test(ui.date) ? ui.date : null;
  // A remembered `date` only anchors the day views (Week (H), Week (D), Day,
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

  const calParam = typeof params.cal === "string" ? params.cal.split(",").filter(Boolean) : [];
  const typesParam =
    typeof params.types === "string" ? params.types.split(",").filter(Boolean) : [];
  const usersParam =
    typeof params.users === "string" ? params.users.split(",").filter(Boolean) : [];

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

  // Dashboard filter state — scoped per view only (the "same for all views" /
  // shared-set mode is removed). Fallback order: the URL (current view only) →
  // that view's per-view memory → the role default. A view the user never
  // configured keeps absent keys and resolves to the role default, so one
  // view's filters can never leak into another's.
  const rememberedDashboard = cookieState?.dashboard;
  // Stale remembered ids are validated against live data here (exactly like
  // URL params), THEN dropped. An explicit EMPTY array survives as an empty
  // set — it records "this view cleared that filter" and must keep resolving
  // to nothing, not to the role default. An all-stale list instead degrades to
  // "nothing remembered" (undefined) and falls through to the role default,
  // matching the pre-existing behavior for a cleared cookie.
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
  const validViews: Partial<Record<DashboardViewValue, DashboardViewFilters>> = {};
  for (const target of DASHBOARD_VIEW_VALUES) {
    const raw = rememberedDashboard?.views?.[target];
    validViews[target] = {
      cal: validCal(raw?.cal),
      users: validUsers(raw?.users),
      types: validTypes(raw?.types),
    };
  }
  const { selected, viewFilters } = resolveDashboardFilters({
    view,
    url: {
      cal: params.cal === undefined ? undefined : calParam.filter((id) => calendarIds.includes(id)),
      users:
        params.users === undefined ? undefined : usersParam.filter((id) => allUserIds.includes(id)),
      types:
        params.types === undefined
          ? undefined
          : typesParam.filter((name) => typeNames.includes(name)),
    },
    views: validViews,
    defaults: { cal: defaultCalendars, users: [], types: [] },
    fresh: freshRender,
  });
  const selectedCalendars = selected.cal;
  const selectedTypes = selected.types;
  const selectedUsers = selected.users;

  // `?event=` deep links (Google Calendar "Edit:" notes, Pinned Events, event
  // search): `_eventCal` carries the target event's calendar, which the
  // resolved filters may exclude (the links can target any calendar, whatever
  // the user's remembered view/filter selection). Add it to the read only —
  // the filter selection (`selectedCalendars`, which drives the filter UI and
  // the remembered state) stays untouched.
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
  // view-assigned template (fallback to master). External events keep Google title.
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
      view={view}
      pinnedViews={pinnedViews}
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
      viewFilters={viewFilters}
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
