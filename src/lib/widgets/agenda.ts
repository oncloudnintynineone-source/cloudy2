/**
 * Server-side builder for the widget agenda (`GET /api/widget/v1/agenda`).
 *
 * A widget is bound to one dashboard view: it reuses that view's **filters**
 * (calendars / users / event types / event-name text) and its **title recipe**,
 * then renders a forward agenda for `today … today + days - 1` regardless of
 * the view's own renderer kind. This deliberately does not call
 * `buildDashboardData`: its month set is anchored to the view's grid (a Week or
 * Day view reads one month), which would miss the tail of a forward window that
 * crosses a month boundary.
 *
 * Reads go through the same layered events cache as every other calendar
 * surface, so a widget tap never fans out to Google on a warm cache. The
 * previous month is included in the read so an event that started before today
 * (multi-day, or an early-morning SGT event stored under the prior UTC month)
 * still appears as ongoing.
 */

import { addDays, formatInstantToNaive, monthsInRange, shiftMonth } from "@/lib/events/datetime";
import { displayTitleOptions, resolveDisplayTitles } from "@/lib/events/eventTitleDisplay";
import { fetchPinnedEventsFor } from "@/lib/events/pinned";
import { listCalendars, projectRangeEvents, readCalendarRange } from "@/lib/events/queries";
import { filterEventsByText } from "@/lib/events/textFilter";
import { listEventTypes } from "@/lib/eventTypes/queries";
import { listUsers } from "@/lib/roster/queries";
import { getSettings, listEventTitleTemplates } from "@/lib/settings/queries";
import { getDashboardViews } from "@/lib/dashboardViews/queries";
import {
  emptyTabFilters,
  resolveActiveTab,
  resolveTabFilters,
  type DashboardViewTab,
} from "@/lib/dashboardViews/views";

import {
  absoluteLink,
  buildWidgetFlat,
  clampWidgetDays,
  dayMonthLabel,
  relativeDayLabel,
  shapeWidgetAgenda,
  shapeWidgetPinned,
  type WidgetAgendaEvent,
  type WidgetPinnedLike,
  type WidgetPinnedSummary,
} from "./shape";
import type { WidgetActor } from "./auth";

/** Used only for a virtual account with no stored views (not reachable by tokens). */
const FALLBACK_TAB: DashboardViewTab = {
  id: "default",
  kind: "month",
  name: "Month",
  sortOrder: 0,
  filters: emptyTabFilters(),
};

export interface WidgetAgendaResponse {
  ok: true;
  v: 1;
  /** Server wall clock (UTC+8) of this read. */
  generatedAt: string;
  today: string;
  window: { start: string; end: string; days: number };
  user: { name: string; department: string };
  view: { id: string; name: string; kind: string };
  next: WidgetAgendaEvent | null;
  events: WidgetAgendaEvent[];
  counts: { today: number; window: number };
  pinned: WidgetPinnedSummary;
  flat: Record<string, string>;
}

export async function buildWidgetAgenda(params: {
  actor: WidgetActor;
  /** A dashboard view id or legacy kind string; null = first tab. */
  view: string | null;
  days: number;
  /** Absolute app origin for deep links (no trailing slash required). */
  origin: string;
  now?: Date;
}): Promise<WidgetAgendaResponse> {
  const tabs = await getDashboardViews(params.actor.id);
  const tab = resolveActiveTab(params.view, null, tabs) ?? tabs[0] ?? FALLBACK_TAB;

  const [calendars, eventTypes, allUsers, settings, templates] = await Promise.all([
    listCalendars(),
    listEventTypes(),
    listUsers(),
    getSettings(),
    listEventTitleTemplates(),
  ]);

  const isAdmin = params.actor.role === "admin";
  const ownDepartmentId = allUsers.find((user) => user.id === params.actor.id)?.department?.id ?? null;
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

  // The dashboard's Users filter treats a tagged department as every active
  // member of it; mirror that membership map exactly.
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

  const now = params.now ?? new Date();
  const generatedAt = formatInstantToNaive(now);
  const today = generatedAt.slice(0, 10);
  const days = clampWidgetDays(params.days);
  const lastDay = addDays(today, days - 1);
  // Previous month too: catches multi-day events that started before today and
  // early-morning SGT events stored under the prior UTC month (see deepLink.ts).
  const months = [
    ...new Set([shiftMonth(today.slice(0, 7), -1), ...monthsInRange(today, lastDay)]),
  ].sort();

  const rangeData = await readCalendarRange({ months, calendarIds: filters.cal });
  const projected = projectRangeEvents(
    rangeData,
    { typeFilter: filters.types, userFilter: filters.users },
    filters.cal,
    memberships,
  );
  const titled = resolveDisplayTitles(projected, displayOptions);
  const filtered = filterEventsByText(titled, filters.text);

  const summary = shapeWidgetAgenda(filtered, {
    viewId: tab.id,
    origin: params.origin,
    today,
    lastDay,
  });

  let pins: WidgetPinnedLike[] = [];
  try {
    const fetched = await fetchPinnedEventsFor({ id: params.actor.id, role: params.actor.role });
    pins = fetched.map((pin) => ({
      title: pin.title,
      start: pin.start,
      eventId: pin.eventId,
      calendarId: pin.calendarId,
    }));
  } catch (error) {
    // Pinned data is a bonus; an agenda read must not fail because of it.
    console.error("[widgets] Pinned read failed", error);
  }
  const pinned = shapeWidgetPinned(pins, {
    viewId: tab.id,
    origin: params.origin,
    today,
  });

  const me = allUsers.find((user) => user.id === params.actor.id);
  const fallbackLink = absoluteLink(`/dashboard?view=${encodeURIComponent(tab.id)}`, params.origin);

  return {
    ok: true,
    v: 1,
    generatedAt,
    today,
    window: { start: today, end: lastDay, days },
    user: {
      name: me?.name ?? params.actor.name,
      department: me?.department?.name ?? "",
    },
    view: { id: tab.id, name: tab.name, kind: tab.kind },
    next: summary.next,
    events: summary.events,
    counts: summary.counts,
    pinned,
    flat: buildWidgetFlat({
      updatedLabel: `Updated ${dayMonthLabel(today)} ${generatedAt.slice(11, 16)}`,
      viewName: tab.name,
      viewKind: tab.kind,
      todayLabel: `${relativeDayLabel(today, today)} ${dayMonthLabel(today)}`,
      events: summary.events,
      pinned,
      fallbackLink,
    }),
  };
}
