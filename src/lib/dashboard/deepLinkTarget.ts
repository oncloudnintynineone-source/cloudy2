/**
 * Lean `?event=` deep-link target resolution.
 *
 * Pinned Events, event search, and the Google Calendar note link all open a
 * target that may sit outside the active tab's month range or be hidden by its
 * filters. The dashboard snapshot deliberately does **not** carry the target:
 * resolving it inside `buildDashboardData` serialized it behind the whole grid
 * read and forced the details modal to wait for the entire snapshot. This
 * resolver reads only the target's own months and the title-render context, so
 * the client can resolve it in parallel with the dashboard load.
 *
 * Server-only (imports the event cache / DB queries). The `"use server"` action
 * wrapper lives in `deepLinkActions.ts`.
 */

import { getDashboardViews } from "@/lib/dashboardViews/queries";
import {
  isDashboardViewKind,
  resolveActiveTab,
  type DashboardViewKind,
} from "@/lib/dashboardViews/views";
import { listEventTypes } from "@/lib/eventTypes/queries";
import { deepLinkMonths, findEventByGroupId } from "@/lib/events/deepLink";
import {
  displayTitleOptions,
  resolveDisplayTitles,
  type DisplayTitleEventType,
  type DisplayTitleUser,
} from "@/lib/events/eventTitleDisplay";
import { fetchRangeEvents, listCalendars, type CalendarEvent } from "@/lib/events/queries";
import { listUsers } from "@/lib/roster/queries";
import {
  getSettings,
  listEventTitleTemplates,
  type EventTitleTemplateView,
} from "@/lib/settings/queries";
import { isUuid } from "@/lib/uuid";

export interface ResolveDeepLinkTargetInput {
  /** The logical event group id from `?event=` (or `?edit=`). */
  eventId: string | null;
  /** The link's `?date=` — only its month window is used. */
  date: string | null;
  /** The tapped copy's calendar id (`_eventCal`), or null. */
  calendarId: string | null;
  /** The active dashboard view kind, for the title-recipe assignment. */
  viewKind: DashboardViewKind;
  /** Bypass the events cache (the dashboard's one-shot force refresh). */
  force?: boolean;
}

/**
 * Resolve one deep-link target over its own month window, with no type/user
 * filters. `_eventCal` (when it names a live calendar) narrows the read to that
 * one copy; an unknown id falls back to every calendar so a pruned/foreign
 * hint can never hide the event.
 */
export async function resolveDeepLinkTarget(
  input: ResolveDeepLinkTargetInput,
): Promise<CalendarEvent | null> {
  const eventId = input.eventId && isUuid(input.eventId) ? input.eventId : null;
  if (!eventId) {
    return null;
  }

  const [calendars, allUsers, eventTypes, settings, templates] = await Promise.all([
    listCalendars(),
    listUsers(),
    listEventTypes(),
    getSettings(),
    listEventTitleTemplates(),
  ]);

  const calendarIds = calendars.map((calendar) => calendar.id);
  const calendarId =
    input.calendarId && calendarIds.includes(input.calendarId) ? input.calendarId : null;

  const targetEvents = await fetchRangeEvents({
    months: deepLinkMonths(input.date),
    calendarIds: calendarId ? [calendarId] : calendarIds,
    typeFilter: [],
    userFilter: [],
    force: input.force === true,
  });

  const usersById = new Map(
    allUsers.map((user) => [
      user.id,
      {
        id: user.id,
        name: user.name,
        shortname: user.shortname,
        departmentName: user.department?.name ?? null,
      } satisfies DisplayTitleUser,
    ]),
  );
  const eventTypesByName = new Map(
    eventTypes.map((type) => [
      type.name,
      { name: type.name, shortname: type.shortname } satisfies DisplayTitleEventType,
    ]),
  );
  const calendarsById = new Map(calendars.map((calendar) => [calendar.id, calendar.name]));
  const templateViews = templates.map(
    (template: EventTitleTemplateView) =>
      ({
        id: template.id,
        label: template.label,
        recipe: template.recipe,
      }) as const,
  );

  return findEventByGroupId(
    resolveDisplayTitles(
      targetEvents,
      displayTitleOptions(input.viewKind, {
        nameTemplate: settings.nameTemplate,
        masterRecipe: settings.eventTitleRecipe,
        assignments: settings.eventTitleTemplateAssignments as Record<string, string>,
        templates: templateViews,
        usersById,
        eventTypesByName,
        calendarsById,
      }),
    ),
    eventId,
  );
}

/**
 * Resolve the title-recipe view kind for a deep link: the caller's explicit
 * kind when valid, else the user's active/first tab kind (the same fallback the
 * dashboard uses). Kept here so the action stays a thin adapter.
 */
export async function deepLinkViewKind(
  userId: string,
  view: string | null,
  requestedKind: string | null | undefined,
): Promise<DashboardViewKind> {
  if (isDashboardViewKind(requestedKind)) {
    return requestedKind;
  }
  const tabs = await getDashboardViews(userId);
  const tab = tabs.length > 0 ? resolveActiveTab(view, null, tabs) : undefined;
  return tab?.kind ?? "month";
}
