"use server";

import { formatInstantToNaive } from "@/lib/events/datetime";
import { renderEventTitle } from "@/lib/events/eventTitle";
import { getUserDepartmentId, listCalendars } from "@/lib/events/queries";
import {
  selectPinnedEventsForDepartments,
  selectUpcomingPinnedEvents,
} from "@/lib/events/pinnedSelect";
import { naiveTimePart } from "@/lib/events/timeOptions";
import { listEventTypes } from "@/lib/eventTypes/queries";
import { ancestorIds } from "@/lib/roster/hierarchy";
import { listUsers } from "@/lib/roster/queries";
import { formatFullName } from "@/lib/settings/formatName";
import { getSettings, getEventTitleTemplateMap } from "@/lib/settings/queries";
import type { TitleRecipe } from "@/lib/settings/titleRecipe";
import { requireSession } from "@/lib/session";
import { isUuid } from "@/lib/uuid";

import { invalidatePinnedSelectionCache, readPinnedSelection } from "./pinnedCache";

export interface PinnedEvent {
  id: string;
  /** Title rendered through the `pinned` target — used by the panel list. */
  title: string;
  /** Title rendered through the `pinnedHeader` target — the rotating header
   *  ticker. Falls back to the master template when unassigned. */
  tickerTitle: string;
  start: string;
  end: string;
  color: string;
  allDay: boolean;
  departments: string[];
  /** Department calendar this pinned copy lives on (`_eventCal` deep link). */
  calendarId: string;
  /** Group id shared by all department copies of the event (the dashboard's
   *  `?event=` deep link matches on it), or null for legacy events. */
  eventId: string | null;
}

/** Drop the durable pinned selection so the next read rescans after an event change. */
export async function invalidatePinnedCache(): Promise<void> {
  await invalidatePinnedSelectionCache();
}

/**
 * Upcoming explicitly-pinned events behind the Pinned Events panel AND the
 * header ticker. The selection itself comes from the durable singleton cache
 * (`pinnedCache.ts`) — only the viewer's department scoping, rolling time
 * window and display shaping run per request. Titles render through each
 * consumer's template assignment and department names resolve for display.
 */
export async function fetchPinnedEvents(): Promise<PinnedEvent[]> {
  const session = await requireSession();

  const [selection, calendars, departmentId] = await Promise.all([
    readPinnedSelection(),
    listCalendars(),
    isUuid(session.user.id) ? getUserDepartmentId(session.user.id) : Promise.resolve(null),
  ]);
  if (selection.length === 0) {
    return [];
  }

  // Scope the selection to the viewer's department. Members see pins targeted at
  // their own department or any ancestor (a parent-department pin reaches the
  // whole subtree); a pin with no targets is global. Admins always see every
  // pin, and a user without a department sees only the global ones.
  const scoped =
    session.user.role === "admin"
      ? selection
      : selectPinnedEventsForDepartments(
          selection,
          departmentId ? [...ancestorIds(calendars, departmentId)] : [],
        );
  const pinned = selectUpcomingPinnedEvents(scoped, formatInstantToNaive(new Date()));
  if (pinned.length === 0) {
    return [];
  }

  const calendarById = new Map(calendars.map((c) => [c.id, c.name]));

  const [settings, users, eventTypes, templateMap] = await Promise.all([
    getSettings(),
    listUsers(),
    listEventTypes(),
    getEventTitleTemplateMap(),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const typeAcronym = new Map(eventTypes.map((t) => [t.name, t.shortname]));

  // Each consumer renders through its own recipe assignment (Settings →
  // Templates → View assignments): the panel list via `pinned`, the header
  // ticker via `pinnedHeader`. Unassigned = Master, exactly like the
  // dashboard views.
  const recipeForTarget = (target: "pinned" | "pinnedHeader"): TitleRecipe => {
    const assignedId = settings.eventTitleTemplateAssignments[target] ?? "";
    if (!assignedId) return settings.eventTitleRecipe;
    return templateMap.get(assignedId)?.recipe ?? settings.eventTitleRecipe;
  };
  const panelRecipe = recipeForTarget("pinned");
  const tickerRecipe = recipeForTarget("pinnedHeader");

  return pinned.map((e) => {
    const people = e.payload.inviteeUserIds.flatMap((id) => {
      const user = userById.get(id);
      if (!user) return [];
      return [
        {
          full: user.name,
          acronym: user.shortname || user.name,
          fqn: formatFullName(
            { name: user.name, departmentName: user.department?.name ?? null },
            settings.nameTemplate,
          ),
        },
      ];
    });
    const eventType = e.payload.eventType
      ? {
          name: e.payload.eventType,
          acronym: typeAcronym.get(e.payload.eventType) ?? e.payload.eventType,
        }
      : null;
    const departments = e.payload.inviteeDepartmentIds
      .map((id) => calendarById.get(id) ?? "")
      .filter(Boolean);
    const titleInput = {
      description: e.payload.rawTitle ?? "",
      eventType,
      people,
      departments,
      location: e.payload.location ?? "",
      timeOption: e.payload.timeOption,
      startTime: naiveTimePart(e.start),
      endTime: naiveTimePart(e.end),
      startAmPm: e.payload.startAmPm ?? "",
      endAmPm: e.payload.endAmPm ?? "",
    } as const;

    return {
      id: e.id,
      title: renderEventTitle({ ...titleInput, recipe: panelRecipe }),
      tickerTitle: renderEventTitle({ ...titleInput, recipe: tickerRecipe }),
      start: e.start,
      end: e.end,
      color: e.color,
      allDay: e.payload.allDay,
      departments,
      calendarId: e.payload.calendarId,
      eventId: e.payload.eventId,
    };
  });
}
