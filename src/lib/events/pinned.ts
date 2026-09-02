"use server";

import { getCachedValue, invalidateCachedValue } from "@/lib/cache";
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

/** The rolling "upcoming" window for the pinned panel: today through the end of
 * the month two months out (3 calendar months, matching the month grid reads). */
function pinnedWindowMonths(): string[] {
  const now = new Date();
  const startNaive = formatInstantToNaive(now).slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 3, 0);
  const endNaive = formatInstantToNaive(end).slice(0, 10);
  return monthsInRange(startNaive, endNaive);
}

// The pinned list is a global value (every department, no user filter) that
// changes only on event CRUD. The header ticker refreshes on mount, tab
// refocus, panel close, and after every CRUD, so a short TTL collapses that
// churn to one read per window; mutations call `invalidatePinnedCache` for
// immediate freshness, matching the events cache's 60s fresh window.
const PINNED_CACHE_TTL_MS = 60_000;
const PINNED_LIST_KEY = "pinned:list";

/** Drop the cached pinned list (and any in-flight loads). */
export async function invalidatePinnedCache(): Promise<void> {
  invalidateCachedValue(PINNED_LIST_KEY);
}

/**
 * The explicitly-pinned upcoming `CalendarEvent`s behind both the panel list
 * and the header ticker: scans every department's calendar (all of them —
 * ignores the dashboard's current filters) over the rolling 3-month window and
 * keeps only the events marked with the `pinned` notes flag, sorted by start
 * time with any already-ended ones dropped.
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
 * Upcoming explicitly-pinned events behind the Pinned Events panel AND the
 * header ticker. Returns only the events marked with the `pinned` notes flag,
 * sorted by start time with any that have already ended dropped. Everything
 * resolves to display-ready data: titles rendered through each consumer's
 * template assignment and department names resolved for display.
 */
export async function fetchPinnedEvents(): Promise<PinnedEvent[]> {
  await requireSession();

  return getCachedValue(PINNED_LIST_KEY, PINNED_CACHE_TTL_MS, async () => {
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

    // Each consumer renders through its own template assignment (Settings →
    // Templates → View assignments): the panel list via `pinned`, the header
    // ticker via `pinnedHeader`. Unassigned = Master, exactly like the
    // dashboard views.
    const templateForTarget = (target: "pinned" | "pinnedHeader"): string => {
      const assignedId = settings.eventTitleTemplateAssignments[target] ?? "";
      if (!assignedId) return settings.eventTitleTemplate;
      return templateMap.get(assignedId)?.template ?? settings.eventTitleTemplate;
    };
    const panelTemplate = templateForTarget("pinned");
    const tickerTemplate = templateForTarget("pinnedHeader");

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
        title: renderEventTitle({ ...titleInput, template: panelTemplate }),
        tickerTitle: renderEventTitle({ ...titleInput, template: tickerTemplate }),
        start: e.start,
        end: e.end,
        color: e.color,
        allDay: e.payload.allDay,
        departments,
        calendarId: e.payload.calendarId,
        eventId: e.payload.eventId,
      };
    });
  });
}
