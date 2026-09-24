/**
 * Server-side builder for the dashboard snapshot.
 *
 * This is the resolution the Calendar page used to run inline in `page.tsx`:
 * session + remembered device state + stored tabs/filters + the month/range
 * event read, reduced to a serializable snapshot. The route now renders a thin
 * client shell and this builder is invoked by the `loadDashboardData` server
 * action so the client can revalidate in the background while showing the last
 * on-device snapshot (docs/pwa-offline.md).
 *
 * The resolution is split into a shared config pass (`resolveDashboardConfig` —
 * calendars, event types, users, settings, tabs, filter validators) and a
 * per-tab projection (`projectTab` / the preload builder). `buildDashboardData`
 * resolves one tab; `buildDashboardPreload` resolves every tab off a single
 * cache read so the client can preload them for instant tab switches.
 */

import { cookies } from "next/headers";
import type { Session } from "next-auth";

import { listEventTypes, listEventTypeGroups } from "@/lib/eventTypes/queries";
import { formatInstantToNaive } from "@/lib/events/datetime";
import {
  fetchRangeEvents,
  listCalendars,
  projectRangeEvents,
  readCalendarRange,
  type CalendarEvent,
  type CalendarRangeData,
} from "@/lib/events/queries";
import { deepLinkMonths, findEventByGroupId } from "@/lib/events/deepLink";
import {
  resolveDisplayTitles,
  type DisplayTitleEventType,
  type DisplayTitleUser,
} from "@/lib/events/eventTitleDisplay";
import { filterUserOptionIds } from "@/lib/filters/filterUserOptions";
import { googleCalendarConfigured } from "@/lib/google";
import { listQuickLinks } from "@/lib/quickLinks/queries";
import { listUsers } from "@/lib/roster/queries";
import { formatFullName } from "@/lib/settings/formatName";
import {
  getSettings,
  listEventTitleTemplates,
  type EventTitleTemplateView,
  type SettingsView,
} from "@/lib/settings/queries";
import {
  glassFabLevelFlag,
  isReorderDragEnabled,
  resolveFlagValue,
  savedEventToastVariantFlag,
} from "@/lib/settings/featureFlags";
import { UI_STATE_COOKIE, decodeUiState } from "@/lib/ui/uiState";
import { isUuid } from "@/lib/uuid";
import { getDashboardViews } from "@/lib/dashboardViews/queries";
import {
  emptyTabFilters,
  resolveActiveTab,
  type DashboardTabFilters,
  type DashboardViewKind,
  type DashboardViewTab,
} from "@/lib/dashboardViews/views";
import {
  assembleDashboardSnapshot,
  dashboardRequestKey,
  requiredMonths,
  type DashboardSharedConfig,
  type DashboardSnapshot,
  type DashboardSnapshotContext,
  type DashboardTabDelta,
} from "./snapshot";

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
  /**
   * The `?event=` deep link's target event, resolved separately from the grid
   * (empty filters, only its own calendar) so it opens even when the active
   * tab's filters would drop it. Not part of `data`, so it is never cached.
   */
  deepLinkEvent: CalendarEvent | null;
}

/** The resolved anchor period (URL-first, then cookie, then today). */
interface DashboardPeriod {
  month: string;
  date: string;
}

type NavState = NonNullable<ReturnType<typeof decodeUiState>>["dashboard"];
type DisplayOptions = Parameters<typeof resolveDisplayTitles>[1];

/** A tab's stored filter overrides resolved against live data. */
interface ResolvedTabFilters {
  cal: string[];
  users: string[];
  types: string[];
}

/**
 * The filter-independent resolution shared by every tab: the snapshot fields
 * all tabs render identically, plus the lookups/validators needed to project
 * any one tab. Built once per request so the per-tab work is pure projection.
 */
interface DashboardConfig {
  /** The snapshot fields every tab shares. */
  shared: DashboardSharedConfig;
  /** The user's tabs in strip order (also the preload target set). */
  tabs: DashboardViewTab[];
  nav: NavState;
  calendarIds: string[];
  defaultCalendars: string[];
  typeNames: string[];
  settings: SettingsView;
  eventTitleTemplates: EventTitleTemplateView[];
  templateMapForDisplay: Map<string, DashboardSnapshot["viewEventTitleRecipe"]>;
  assignments: Record<string, string>;
  usersById: Map<string, DisplayTitleUser>;
  eventTypesByName: Map<string, DisplayTitleEventType>;
  calendarsById: Map<string, string>;
  /** Active roster grouped by department id — the user filter's membership map. */
  membershipsByDepartment: ReadonlyMap<string, string[]>;
  /** Resolve a tab's stored filter overrides against live data. */
  resolveSelectedFilters: (tab: DashboardViewTab) => ResolvedTabFilters;
  /** The resource rows a tab's selected calendars produce. */
  scheduleUsersFor: (selectedCalendars: string[]) => DashboardSnapshot["scheduleUsers"];
  /** The Users-filter options for a tab's selected calendars (+ self). */
  filterUsersFor: (selectedCalendars: string[]) => DashboardSnapshot["filterUsers"];
  /** The title recipe assigned to a tab's kind (falls back to the master). */
  viewRecipeFor: (kind: DashboardViewKind) => DashboardSnapshot["viewEventTitleRecipe"];
  /** The display-title options for a tab's kind. */
  displayOptionsFor: (kind: DashboardViewKind) => DisplayOptions;
}

function currentMonth(): string {
  return formatInstantToNaive(new Date()).slice(0, 7);
}

/**
 * Read every filter-independent piece a dashboard render needs. The
 * user-independent reads (calendars, event types/groups, users, settings,
 * templates, quick links) are React-`cache()`d per request **and** served from a
 * shared 60s in-memory TTL (`src/lib/configCache.ts`), so the config pass and
 * the range read reuse one DB read each — and the separate `preloadDashboardTabs`
 * action (which can't share React's per-request cache) doesn't re-query them.
 */
async function resolveDashboardConfig(session: Session): Promise<DashboardConfig> {
  const isAdmin = session.user.role === "admin";

  // One batched pass: the tab/cookie reads run alongside the
  // calendars/types/users/settings reads instead of before them, so the small
  // connection pool (max 3) is never left idle between round trips. The
  // signed-in user's own department is derived from the already-fetched user
  // list (a separate `getUserDepartmentId` query would be a redundant round
  // trip on every config pass).
  const [
    storedTabs,
    cookieStore,
    calendars,
    eventTypes,
    eventTypeGroups,
    allUsers,
    settings,
    quickLinks,
    eventTitleTemplates,
  ] = await Promise.all([
    getDashboardViews(session.user.id),
    cookies(),
    listCalendars(),
    listEventTypes(),
    listEventTypeGroups(),
    listUsers(),
    getSettings(),
    listQuickLinks(),
    listEventTitleTemplates(),
  ]);

  // Admins default to every calendar; a regular user defaults to their own
  // department (null when unassigned).
  const ownDepartmentId = isAdmin
    ? null
    : (allUsers.find((user) => user.id === session.user.id)?.department?.id ?? null);

  const canManageViews = storedTabs.length > 0;
  const tabs = storedTabs.length > 0 ? storedTabs : [STATIC_DEFAULT_TAB];

  // Per-device "where you are" state: where the URL is silent, the last
  // rendered date/month anchor applies, so a cold open (or F5) lands where the
  // user left off. URL params always win.
  const cookieState = decodeUiState(cookieStore.get(UI_STATE_COOKIE)?.value);
  const nav = cookieState?.dashboard;

  const calendarIds = calendars.map((calendar) => calendar.id);
  const departmentParentById = new Map(
    calendars.map((calendar) => [calendar.id, calendar.parentId ?? null]),
  );

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
    collapsible: group.collapsible,
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

  const defaultFilters: DashboardTabFilters = {
    cal: defaultCalendars,
    users: [],
    types: [],
  };

  const activeUsers = allUsers.filter((user) => user.status === "active");
  const pickerUsers = activeUsers;

  const scheduleUsersFor = (selectedCalendars: string[]) =>
    activeUsers
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

  // Active roster grouped by department — lets the Users filter match an event
  // tagged on a department against every active member (the same occupancy
  // model the schedule rows and clash check use).
  const membershipsByDepartment = new Map<string, string[]>();
  for (const user of allActiveUsers) {
    if (!user.departmentId) {
      continue;
    }
    const list = membershipsByDepartment.get(user.departmentId);
    if (list) {
      list.push(user.id);
    } else {
      membershipsByDepartment.set(user.departmentId, [user.id]);
    }
  }

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

  const filterUsersFor = (selectedCalendars: string[]) => {
    const rowUserIds = activeUsers
      .filter((user) => user.department && selectedCalendars.includes(user.department.id))
      .map((user) => user.id);
    const filterUserIds = filterUserOptionIds({
      users: allUsers,
      rowUserIds,
      currentUserId: session.user.id,
    });
    return allUsers
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
  };

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

  const templateMapForDisplay = new Map(eventTitleTemplates.map((t) => [t.id, t.recipe] as const));
  const assignments = settings.eventTitleTemplateAssignments as Record<string, string>;
  const viewRecipeFor = (kind: DashboardViewKind) => {
    const assignedRecipe = assignments[kind]
      ? templateMapForDisplay.get(assignments[kind])
      : undefined;
    return assignedRecipe ?? settings.eventTitleRecipe;
  };

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
  const displayOptionsFor = (kind: DashboardViewKind): DisplayOptions => ({
    view: kind,
    nameTemplate: settings.nameTemplate,
    masterRecipe: settings.eventTitleRecipe,
    assignments,
    templates: eventTitleTemplates.map((t) => ({ id: t.id, label: t.label, recipe: t.recipe })),
    usersById,
    eventTypesByName,
    calendarsById,
  });

  const shared: DashboardSharedConfig = {
    tabs,
    canManageViews,
    calendars: calendars.map((calendar) => ({
      id: calendar.id,
      name: calendar.name,
      sortOrder: calendar.sortOrder,
      parentId: calendar.parentId,
    })),
    eventTypes: eventTypeOptions,
    eventTypeGroups: eventTypeGroupOptions,
    eventTitleRecipe: settings.eventTitleRecipe,
    googleConfigured: googleCalendarConfigured(),
    savedEventToastVariant: resolveFlagValue(
      savedEventToastVariantFlag,
      settings.featureFlags.savedEventToastVariant,
    ),
    glassFabLevel: resolveFlagValue(glassFabLevelFlag, settings.featureFlags.glassFabLevel),
    reorderDrag: isReorderDragEnabled(settings.featureFlags.reorderDrag),
    quickLinks: quickLinks
      .filter((link) => link.enabled)
      .map((link) => ({
        id: link.id,
        label: link.label,
        url: link.url,
        icon: link.icon,
        color: link.color,
      })),
    defaultFilters,
    currentUser: session.user.id,
    isAdmin,
    allActiveUsers,
    inviteeDepartments,
    inviteeUsers,
    peopleNames,
    calendarNames,
    currentUserName: session.user.name ?? "",
  };

  const resolveSelectedFilters = (tab: DashboardViewTab): ResolvedTabFilters => ({
    cal: resolveFilter(tab.filters.cal, validCal, defaultCalendars),
    users: resolveFilter(tab.filters.users, validUsers, []),
    types: resolveFilter(tab.filters.types, validTypes, []),
  });

  return {
    shared,
    tabs,
    nav,
    calendarIds,
    defaultCalendars,
    typeNames,
    settings,
    eventTitleTemplates,
    templateMapForDisplay,
    assignments,
    usersById,
    eventTypesByName,
    calendarsById,
    membershipsByDepartment,
    resolveSelectedFilters,
    scheduleUsersFor,
    filterUsersFor,
    viewRecipeFor,
    displayOptionsFor,
  };
}

/** Resolve the anchor month/date (URL-first, then cookie, then today). */
function resolvePeriod(
  config: DashboardConfig,
  activeKind: DashboardViewKind,
  input: BuildDashboardDataInput,
): DashboardPeriod {
  const nav = config.nav;
  const urlDate = input.date && DATE_PATTERN.test(input.date) ? input.date : null;
  const cookieDate = typeof nav?.date === "string" && DATE_PATTERN.test(nav.date) ? nav.date : null;
  const dateParam = urlDate ?? (activeKind === "month" ? null : cookieDate);

  const urlMonth = input.month && MONTH_PATTERN.test(input.month) ? input.month : null;
  const cookieMonth =
    typeof nav?.month === "string" && MONTH_PATTERN.test(nav.month) ? nav.month : null;
  const month =
    dateParam !== null ? dateParam.slice(0, 7) : (urlMonth ?? cookieMonth ?? currentMonth());
  const date = dateParam ?? formatInstantToNaive(new Date()).slice(0, 10);
  return { month, date };
}

/** Project one tab's events + variable snapshot fields from a shared range read. */
function projectTab(
  config: DashboardConfig,
  tab: DashboardViewTab,
  period: DashboardPeriod,
  rangeData: CalendarRangeData,
): { delta: DashboardTabDelta; context: DashboardSnapshotContext } {
  const filters = config.resolveSelectedFilters(tab);
  const projected = projectRangeEvents(
    rangeData,
    { typeFilter: filters.types, userFilter: filters.users },
    filters.cal,
    config.membershipsByDepartment,
  );
  const events = resolveDisplayTitles(projected, config.displayOptionsFor(tab.kind));
  const months = requiredMonths(tab.kind, period.month, period.date);

  const delta: DashboardTabDelta = {
    activeView: tab,
    events,
    selectedCalendarIds: filters.cal,
    selectedTypes: filters.types,
    selectedUserIds: filters.users,
    viewEventTitleRecipe: config.viewRecipeFor(tab.kind),
    scheduleUsers: config.scheduleUsersFor(filters.cal),
    filterUsers: config.filterUsersFor(filters.cal),
  };
  const context: DashboardSnapshotContext = {
    month: period.month,
    date: period.date,
    viewId: tab.id,
    requestKey: dashboardRequestKey({ viewId: tab.id, months }),
  };
  return { delta, context };
}

/** Resolve the URL `?view=` to a tab, falling back to the first tab in order. */
function resolveRequestedTab(config: DashboardConfig, input: BuildDashboardDataInput) {
  const urlView = input.view && input.view.length > 0 ? input.view : null;
  return resolveActiveTab(urlView, null, config.tabs) ?? STATIC_DEFAULT_TAB;
}

export async function buildDashboardData(
  input: BuildDashboardDataInput,
  session: Session,
): Promise<BuiltDashboardData> {
  const config = await resolveDashboardConfig(session);
  const activeTab = resolveRequestedTab(config, input);
  const period = resolvePeriod(config, activeTab.kind, input);
  const selectedCalendars = config.resolveSelectedFilters(activeTab).cal;

  // The months this view actually needs (Month grid: 2-3; Week: 1-2 at a
  // boundary; Day/Agenda: one). Shared with the client's fetch signature so an
  // in-month day move never triggers a server read.
  const rangeMonths = requiredMonths(activeTab.kind, period.month, period.date);
  const rangeData = await readCalendarRange({
    months: rangeMonths,
    calendarIds: selectedCalendars,
    force: input.force,
  });
  const { delta, context } = projectTab(config, activeTab, period, rangeData);

  // `?event=` deep links: `_eventCal` names the target copy's calendar. It is
  // used only to resolve that one event (below) — never added to the grid's
  // fetch set, so the active filters and the rendered event set stay untouched.
  const eventCalParam =
    input.eventCal && config.calendarIds.includes(input.eventCal) ? input.eventCal : null;
  const deepLinkEventId = input.event && isUuid(input.event) ? input.event : null;

  // Resolve the `?event=` deep-link target on its own — no type/user filters and
  // the target's **own** months (`deepLinkMonths(input.date)`), never the active
  // tab's `rangeMonths`. Pinned Events lists a rolling 3-month window regardless
  // of the active tab, so a tab whose required months don't include the target's
  // month would otherwise never resolve it (the "not in your current view" alert).
  // It never joins the grid's `events`, so the filter selection stays visually
  // authoritative. When `_eventCal` is unknown (a pruned/foreign calendar) fall
  // back to every calendar for those months so the copy can still be found.
  let deepLinkEvent: CalendarEvent | null = null;
  if (deepLinkEventId) {
    const targetEvents = await fetchRangeEvents({
      months: deepLinkMonths(input.date),
      calendarIds: eventCalParam ? [eventCalParam] : config.calendarIds,
      typeFilter: [],
      userFilter: [],
      force: input.force,
    });
    deepLinkEvent = findEventByGroupId(
      resolveDisplayTitles(targetEvents, config.displayOptionsFor(activeTab.kind)),
      deepLinkEventId,
    );
  }

  const data: DashboardSnapshot = assembleDashboardSnapshot(config.shared, delta);

  return {
    data,
    month: period.month,
    date: period.date,
    viewId: activeTab.id,
    requestKey: context.requestKey,
    deepLinkEvent,
  };
}

export interface BuiltDashboardPreload {
  /** The snapshot fields every preloaded tab shares. */
  shared: DashboardSharedConfig;
  /** One entry per tab: its context plus the variable snapshot fields. */
  tabs: { context: DashboardSnapshotContext; delta: DashboardTabDelta }[];
}

/**
 * Resolve every tab for the active anchor off a single cache read, so the
 * client can preload them and switch tabs with no server round-trip
 * (docs/pwa-offline.md). The config pass is shared, the calendars/months across
 * tabs are unioned, and each tab's events are projected from the same raw read.
 * Never forces a Google refresh — it warms what the active context already read.
 */
export async function buildDashboardPreload(
  input: BuildDashboardDataInput,
  session: Session,
): Promise<BuiltDashboardPreload> {
  const config = await resolveDashboardConfig(session);
  const activeTab = resolveRequestedTab(config, input);
  const period = resolvePeriod(config, activeTab.kind, input);

  const resolved = config.tabs.map((tab) => ({
    tab,
    filters: config.resolveSelectedFilters(tab),
  }));
  const unionCalendars = [...new Set(resolved.flatMap((entry) => entry.filters.cal))];
  const unionMonths = [
    ...new Set(
      resolved.flatMap((entry) => requiredMonths(entry.tab.kind, period.month, period.date)),
    ),
  ];

  const rangeData = await readCalendarRange({
    months: unionMonths,
    calendarIds: unionCalendars,
  });

  const tabs = resolved.map((entry) => {
    const { delta, context } = projectTab(config, entry.tab, period, rangeData);
    return { context, delta };
  });

  return { shared: config.shared, tabs };
}
