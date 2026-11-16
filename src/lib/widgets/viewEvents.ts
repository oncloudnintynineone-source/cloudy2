/**
 * Shared dashboard-view resolution for the calendar-feed subscription. The feed
 * must agree with the dashboard on what a view means: its stored filters
 * resolved against live data, the department-membership map the Users filter
 * uses, and the title recipe assigned to its renderer kind.
 *
 * Kept separate from `feed.ts` so the ICS rendering stays easy to reason about
 * while the view read/filtering reuses the dashboard's exact projection.
 */

import {
  emptyTabFilters,
  resolveActiveTab,
  resolveTabFilters,
  type DashboardViewTab,
  type ResolvedTabFilters,
} from "@/lib/dashboardViews/views";
import { getDashboardViews } from "@/lib/dashboardViews/queries";
import { displayTitleOptions, resolveDisplayTitles } from "@/lib/events/eventTitleDisplay";
import type { DisplayTitleOptions } from "@/lib/events/eventTitleDisplay";
import { listCalendars, projectRangeEvents, readCalendarRange } from "@/lib/events/queries";
import type { CalendarEvent } from "@/lib/events/queries";
import { filterEventsByText } from "@/lib/events/textFilter";
import { listEventTypes } from "@/lib/eventTypes/queries";
import { listUsers } from "@/lib/roster/queries";
import { getSettings, listEventTitleTemplates } from "@/lib/settings/queries";
import type { SettingsView } from "@/lib/settings/queries";

/** Only reachable for a virtual account with no stored views (never a feed/token owner). */
export const FALLBACK_VIEW_TAB: DashboardViewTab = {
  id: "default",
  kind: "month",
  name: "Month",
  sortOrder: 0,
  filters: emptyTabFilters(),
};

export interface WidgetViewConfig {
  tab: DashboardViewTab;
  filters: ResolvedTabFilters;
  calendars: Awaited<ReturnType<typeof listCalendars>>;
  allUsers: Awaited<ReturnType<typeof listUsers>>;
  settings: SettingsView;
  /** Department id → active member ids (the dashboard Users filter model). */
  memberships: ReadonlyMap<string, string[]>;
  displayOptions: DisplayTitleOptions;
}

/**
 * Resolve a feed actor + view selector (id or legacy kind string) into
 * everything a range read needs. The reads are the same cached config queries
 * the dashboard uses, so a feed request reuses their 60s TTLs.
 */
export async function resolveWidgetView(
  actor: { id: string; role: "admin" | "user" },
  view: string | null,
): Promise<WidgetViewConfig> {
  const tabs = await getDashboardViews(actor.id);
  const tab = resolveActiveTab(view, null, tabs) ?? tabs[0] ?? FALLBACK_VIEW_TAB;

  const [calendars, eventTypes, allUsers, settings, templates] = await Promise.all([
    listCalendars(),
    listEventTypes(),
    listUsers(),
    getSettings(),
    listEventTitleTemplates(),
  ]);

  const isAdmin = actor.role === "admin";
  const ownDepartmentId = allUsers.find((user) => user.id === actor.id)?.department?.id ?? null;
  const defaultCalendars = isAdmin
    ? calendars.map((calendar) => calendar.id)
    : ownDepartmentId
      ? [ownDepartmentId]
      : [];

  const filters = resolveTabFilters(tab.filters, {
    calendarIds: calendars.map((calendar) => calendar.id),
    userIds: allUsers.map((user) => user.id),
    typeNames: eventTypes.map((type) => type.name),
    defaultCalendars,
  });

  const memberships = new Map<string, string[]>();
  for (const user of allUsers) {
    if (user.status !== "active" || !user.department) {
      continue;
    }
    const list = memberships.get(user.department.id);
    if (list) {
      list.push(user.id);
    } else {
      memberships.set(user.department.id, [user.id]);
    }
  }

  const displayOptions = displayTitleOptions(tab.kind, {
    nameTemplate: settings.nameTemplate,
    masterRecipe: settings.eventTitleRecipe,
    assignments: settings.eventTitleTemplateAssignments as Record<string, string>,
    templates: templates.map((template) => ({
      id: template.id,
      label: template.label,
      recipe: template.recipe,
    })),
    usersById: new Map(
      allUsers.map((user) => [
        user.id,
        {
          id: user.id,
          name: user.name,
          shortname: user.shortname,
          departmentName: user.department?.name ?? null,
        },
      ]),
    ),
    eventTypesByName: new Map(
      eventTypes.map((type) => [type.name, { name: type.name, shortname: type.shortname }]),
    ),
    calendarsById: new Map(calendars.map((calendar) => [calendar.id, calendar.name])),
  });

  return { tab, filters, calendars, allUsers, settings, memberships, displayOptions };
}

/**
 * Read `months` through the layered events cache and apply the view's filters,
 * title recipe and event-name text filter. No window shaping — the feed applies
 * its own ±3-month window after this.
 */
export async function readWidgetViewEvents(
  config: WidgetViewConfig,
  months: string[],
): Promise<CalendarEvent[]> {
  const rangeData = await readCalendarRange({ months, calendarIds: config.filters.cal });
  const projected = projectRangeEvents(
    rangeData,
    { typeFilter: config.filters.types, userFilter: config.filters.users },
    config.filters.cal,
    config.memberships,
  );
  const titled = resolveDisplayTitles(projected, config.displayOptions);
  return filterEventsByText(titled, config.filters.text);
}
