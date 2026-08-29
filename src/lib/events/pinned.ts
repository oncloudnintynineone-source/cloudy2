"use server";

import { fetchRangeEvents, listCalendars, type CalendarEvent } from "@/lib/events/queries";
import { renderEventTitle } from "@/lib/events/eventTitle";
import { listEventTypes } from "@/lib/eventTypes/queries";
import { listUsers } from "@/lib/roster/queries";
import { selectUpcomingPinnedEvents } from "@/lib/events/pinnedSelect";
import { naiveTimePart } from "@/lib/events/timeOptions";
import { formatInstantToNaive, monthsInRange } from "@/lib/events/datetime";
import { formatFullName } from "@/lib/settings/formatName";
import { getSettings, getEventTitleTemplateMap } from "@/lib/settings/queries";
import { requireSession } from "@/lib/session";

export interface PinnedEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  color: string;
  allDay: boolean;
  departments: string[];
  /** Group id shared by all department copies of the event (the dashboard's
   *  `?event=` deep link matches on it), or null for legacy events. */
  eventId: string | null;
}

/** The rolling "upcoming" window for the pinned panel: today through the end of
 * the month two months out (3 calendar months, matching the month grid reads). */
function pinnedWindowMonths(): string[] {
  const now = new Date();
  const startNaive = formatInstantToNaive(now).slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 3, 0);
  const endNaive = formatInstantToNaive(end).slice(0, 10);
  return monthsInRange(startNaive, endNaive);
}

/**
 * The department-pinned upcoming `CalendarEvent`s behind both the panel list
 * and the header count badge: scans every department's calendar (all of them —
 * ignores the dashboard's current filters) over the rolling 3-month window and
 * keeps only the events that pin a whole department (`inviteeDepartmentIds`
 * non-empty), sorted by start time with any already-ended ones dropped.
 */
async function upcomingPinnedCalendarEvents(
  calendars: Awaited<ReturnType<typeof listCalendars>>,
): Promise<CalendarEvent[]> {
  if (calendars.length === 0) {
    return [];
  }
  const events = await fetchRangeEvents({
    months: pinnedWindowMonths(),
    calendarIds: calendars.map((c) => c.id),
    typeFilter: [],
    userFilter: [],
  });
  const nowNaive = formatInstantToNaive(new Date()).slice(0, 10);
  return selectUpcomingPinnedEvents(events, nowNaive);
}

/**
 * Header badge count: how many department-pinned events are upcoming. Shares
 * the panel's read but skips the title/name resolution, so it stays cheap and
 * is served from the events cache.
 */
export async function countPinnedEvents(): Promise<number> {
  await requireSession();
  const calendars = await listCalendars();
  return (await upcomingPinnedCalendarEvents(calendars)).length;
}

/**
 * Upcoming department-tagged events for the Pinned Events panel. Returns only
 * the events that pin a whole department (`inviteeDepartmentIds` non-empty),
 * sorted by start time with any that have already ended dropped. Everything
 * resolves to display-ready data: titles rendered through the shared title
 * template and department names resolved for display.
 */
export async function fetchPinnedEvents(): Promise<PinnedEvent[]> {
  await requireSession();

  const calendars = await listCalendars();
  const calendarById = new Map(calendars.map((c) => [c.id, c.name]));
  const pinned = await upcomingPinnedCalendarEvents(calendars);

  if (pinned.length === 0) {
    return [];
  }

  const [settings, users, eventTypes, templateMap] = await Promise.all([
    getSettings(),
    listUsers(),
    listEventTypes(),
    getEventTitleTemplateMap(),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const typeAcronym = new Map(eventTypes.map((t) => [t.name, t.shortname]));

  // The pinned panel renders the event title template assigned to the
  // `pinned` target (Settings → Templates → View assignments); unassigned =
  // Master, exactly like the dashboard views.
  const pinnedTemplateId = settings.eventTitleTemplateAssignments["pinned"] ?? "";
  const pinnedTemplate = pinnedTemplateId
    ? templateMap.get(pinnedTemplateId)?.template ?? settings.eventTitleTemplate
    : settings.eventTitleTemplate;

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
      ? { name: e.payload.eventType, acronym: typeAcronym.get(e.payload.eventType) ?? e.payload.eventType }
      : null;
    const departments = e.payload.inviteeDepartmentIds
      .map((id) => calendarById.get(id) ?? "")
      .filter(Boolean);
    const title = renderEventTitle({
      description: e.payload.rawTitle ?? "",
      eventType,
      people,
      departments,
      location: e.payload.location ?? "",
      template: pinnedTemplate,
      timeOption: e.payload.timeOption,
      startTime: naiveTimePart(e.start),
      endTime: naiveTimePart(e.end),
      startAmPm: e.payload.startAmPm ?? "",
      endAmPm: e.payload.endAmPm ?? "",
    });

    return {
      id: e.id,
      title,
      start: e.start,
      end: e.end,
      color: e.color,
      allDay: e.payload.allDay,
      departments,
      eventId: e.payload.eventId,
    };
  });
}
