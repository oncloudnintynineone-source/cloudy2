/**
 * Read side of the event clash check: existing events overlapping an instant
 * window across a bounded set of department calendars, shaped for the pure
 * engine (`clashes.ts`).
 *
 * Every calendar month listing is served by the sanctioned layered events
 * cache (`getCachedMonthEventsForCalendars`) — never raw `listEvents` — so the
 * advisory reads the same data the dashboard shows. The read is scoped to the
 * candidate's target calendars: because every event that occupies a person has
 * a copy on that person's own department calendar (and a department-tagged
 * event has a copy on the tagged department's calendar), reading the target
 * set is sufficient to find every conflict for the candidate's people.
 * See docs/event-clashes.md.
 */

import { formatInstantToNaive, monthsInRange } from "@/lib/events/datetime";
import { listCalendars } from "@/lib/events/queries";
import { isExternalEvent, parseEventPeople } from "@/lib/events/notes";
import type { ClashEventInput } from "@/lib/events/clashes";
import { getCachedMonthEventsForCalendars } from "@/lib/google/eventsCache";

/**
 * The `YYYY-MM` month keys whose listings can contain an event overlapping the
 * half-open [windowStart, windowEnd) instant window. Mirrors the KAH read's
 * `windowMonths` (`src/lib/kah/status.ts`) exactly so the two never diverge on
 * which months count — the end is exclusive, so a window ending exactly on a
 * month boundary does not pull in the following month (an event only listed
 * there would span the boundary and therefore also overlap the previous
 * month's listing).
 */
export function clashWindowMonths(windowStart: Date, windowEnd: Date): string[] {
  const naiveStart = formatInstantToNaive(windowStart);
  // Last instant covered by the half-open window.
  const naiveEnd = formatInstantToNaive(new Date(windowEnd.getTime() - 1));
  return [...new Set(monthsInRange(naiveStart, naiveEnd))];
}

/**
 * Existing events on the given department calendars overlapping
 * [windowStart, windowEnd), shaped for `computeClashes`. Items are deduped by
 * (calendar row, Google event id) across the month listings; logical copies
 * sharing a group id are left to the engine to collapse. Pure at the edges —
 * calendar reads go through the month cache.
 */
export async function clashingEventsFor(
  targetCalendarIds: string[],
  windowStart: Date,
  windowEnd: Date,
): Promise<ClashEventInput[]> {
  const allCalendars = await listCalendars();
  const rows = allCalendars.filter((calendar) => targetCalendarIds.includes(calendar.id));
  if (rows.length === 0) {
    return [];
  }

  const months = clashWindowMonths(windowStart, windowEnd);
  const cachedPerMonth = await Promise.all(
    months.map((month) =>
      getCachedMonthEventsForCalendars(
        rows.map((row) => row.googleCalendarId),
        month,
      ),
    ),
  );

  const seen = new Set<string>();
  const events: ClashEventInput[] = [];
  for (const cached of cachedPerMonth) {
    for (const row of rows) {
      for (const item of cached.events[row.googleCalendarId] ?? []) {
        if (item.start > windowEnd || item.end < windowStart) {
          continue;
        }
        const key = `${row.id}:${item.id}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const people = parseEventPeople(item.description);
        events.push({
          calendarId: row.id,
          googleEventId: item.id,
          eventId: people.eventId,
          calendarName: row.name,
          title: item.title || "(no title)",
          start: item.start,
          end: item.end,
          allDay: item.allDay,
          external: isExternalEvent(item.description),
          people: {
            creatorId: people.creatorId,
            userIds: people.userIds,
            departmentIds: people.departmentIds,
          },
        });
      }
    }
  }
  return events;
}
