/**
 * Shared dashboard-view resolution for the calendar-feed subscription. The feed
 * must agree with the dashboard on what a view means: its stored filters
 * resolved against live data, the department-membership map the Users filter
 * uses, and the title recipe assigned to its renderer kind.
 *
 * The pure `projectWidgetViewEvents` half is exported so the feed's filter
 * wiring (the view's Cal/Users/Types/Event-name filters) is unit-tested against
 * a hand-built range read, without a database.
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
import {
  listCalendars,
  projectRangeEvents,
  readCalendarRange,
  type CalendarRangeData,
} from "@/lib/events/queries";
import type { CalendarEvent } from "@/lib/events/queries";
import { filterEventsByText } from "@/lib/events/textFilter";
import { listEventTypes } from "@/lib/eventTypes/queries";
import { listUsers } from "@/lib/roster/queries";
import { getSettings, listEventTitleTemplates } from "@/lib/settings/queries";
import type { SettingsView } from "@/lib/settings/queries";

/** Only reachable for a virtual account with no stored views (never a feed owner). */
export const FALLBACK_VIEW_TAB: DashboardViewTab = {
  id: "default",
  kind: "month",
  name: "Month",
  sortOrder: 0,
  filters: emptyTabFilters(),
};

/** The live data a view's stored filters are resolved against. */
export interface WidgetFilterContext {
  calendars: Awaited<ReturnType<typeof listCalendars>>;
  eventTypes: Awaited<ReturnType<typeof listEventTypes>>;
  allUsers: Awaited<ReturnType<typeof listUsers>>;
  /** Department id → active member ids (the dashboard Users filter model). */
  memberships: ReadonlyMap<string, string[]>;
  /** The role default when a tab's calendar filter is `null`. */
  defaultCalendars: string[];
}

export interface WidgetViewConfig {
  tab: DashboardViewTab;
  filters: ResolvedTabFilters;
  /** Human-readable effective filter scope (dialog + ICS `X-WR-CALDESC`). */
  filterSummary: string;
  calendars: WidgetFilterContext["calendars"];
  allUsers: WidgetFilterContext["allUsers"];
  settings: SettingsView;
  memberships: ReadonlyMap<string, string[]>;
  displayOptions: DisplayTitleOptions;
}

/**
 * Read the filter-independent live context the feed needs (calendars, event
 * types, roster users, memberships, role default). The same 60s-cached reads
 * the dashboard uses, so a feed request reuses them.
 */
export async function loadWidgetFilterContext(actor: {
  id: string;
  role: "admin" | "user";
}): Promise<WidgetFilterContext> {
  const [calendars, eventTypes, allUsers] = await Promise.all([
    listCalendars(),
    listEventTypes(),
    listUsers(),
  ]);

  const isAdmin = actor.role === "admin";
  const ownDepartmentId = allUsers.find((user) => user.id === actor.id)?.department?.id ?? null;
  const defaultCalendars = isAdmin
    ? calendars.map((calendar) => calendar.id)
    : ownDepartmentId
      ? [ownDepartmentId]
      : [];

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

  return { calendars, eventTypes, allUsers, memberships, defaultCalendars };
}

/** Resolve one tab's stored overrides against the live context. */
export function resolveWidgetTabFilters(
  tab: Pick<DashboardViewTab, "filters">,
  context: WidgetFilterContext,
): ResolvedTabFilters {
  return resolveTabFilters(tab.filters, {
    calendarIds: context.calendars.map((calendar) => calendar.id),
    userIds: context.allUsers.map((user) => user.id),
    typeNames: context.eventTypes.map((type) => type.name),
    defaultCalendars: context.defaultCalendars,
  });
}

/**
 * Human-readable summary of a view's **effective** filters, e.g.
 * `1/4 calendars · 2 users · 1 type · Name “parade”`. Shown in the feed dialog
 * and written into the ICS `X-WR-CALDESC`, so a subscription proves its scope
 * even after it is copied to a phone.
 */
export function summarizeTabFilters(
  tab: Pick<DashboardViewTab, "filters">,
  context: WidgetFilterContext,
): string {
  const filters = resolveWidgetTabFilters(tab, context);
  const totalCalendars = context.calendars.length;
  const calendarPart =
    totalCalendars === 0
      ? "No calendars"
      : filters.cal.length >= totalCalendars
        ? "All calendars"
        : `${filters.cal.length}/${totalCalendars} calendars`;
  const usersPart =
    filters.users.length === 0
      ? "All users"
      : `${filters.users.length} user${filters.users.length === 1 ? "" : "s"}`;
  const typesPart =
    filters.types.length === 0
      ? "All types"
      : `${filters.types.length} type${filters.types.length === 1 ? "" : "s"}`;
  const parts = [calendarPart, usersPart, typesPart];
  if (filters.text) {
    parts.push(`Name “${filters.text}”`);
  }
  return parts.join(" · ");
}

/**
 * Resolve a feed actor + view selector (id or legacy kind string) into
 * everything a range read needs, including the effective filter summary.
 */
export async function resolveWidgetView(
  actor: { id: string; role: "admin" | "user" },
  view: string | null,
): Promise<WidgetViewConfig> {
  const tabs = await getDashboardViews(actor.id);
  const tab = resolveActiveTab(view, null, tabs) ?? tabs[0] ?? FALLBACK_VIEW_TAB;

  const [context, settings, templates] = await Promise.all([
    loadWidgetFilterContext(actor),
    getSettings(),
    listEventTitleTemplates(),
  ]);
  const filters = resolveWidgetTabFilters(tab, context);

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
      context.allUsers.map((user) => [
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
      context.eventTypes.map((type) => [type.name, { name: type.name, shortname: type.shortname }]),
    ),
    calendarsById: new Map(context.calendars.map((calendar) => [calendar.id, calendar.name])),
  });

  return {
    tab,
    filters,
    filterSummary: summarizeTabFilters(tab, context),
    calendars: context.calendars,
    allUsers: context.allUsers,
    settings,
    memberships: context.memberships,
    displayOptions,
  };
}

/**
 * Project one range read through the view's Cal/Users/Types/Event-name filters,
 * title recipe and department-membership map. Pure (no I/O) so the feed's filter
 * wiring is unit-tested against a hand-built `CalendarRangeData`.
 */
export function projectWidgetViewEvents(
  rangeData: CalendarRangeData,
  config: Pick<WidgetViewConfig, "filters" | "memberships" | "displayOptions">,
): CalendarEvent[] {
  const projected = projectRangeEvents(
    rangeData,
    { typeFilter: config.filters.types, userFilter: config.filters.users },
    config.filters.cal,
    config.memberships,
  );
  const titled = resolveDisplayTitles(projected, config.displayOptions);
  return filterEventsByText(titled, config.filters.text);
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
  return projectWidgetViewEvents(rangeData, config);
}
