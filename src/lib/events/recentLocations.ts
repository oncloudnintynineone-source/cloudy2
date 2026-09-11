"use server";

import { formatInstantToNaive, shiftMonth } from "@/lib/events/datetime";
import { getUserDepartmentId, listCalendars } from "@/lib/events/queries";
import { parseEventPeople } from "@/lib/events/notes";
import { getCachedMonthEventsForCalendarsMulti } from "@/lib/google/eventsCache";
import { requireSession } from "@/lib/session";

/**
 * How many trailing months (including the current one) the recent-location
 * suggestion scan covers.
 */
const RECENT_LOCATIONS_MONTHS = 3;

/** Maximum suggestions returned (the wizard's Location-step chip row). */
const RECENT_LOCATIONS_MAX = 8;

/**
 * Read-only, best-effort "recent locations" suggestions for the event wizard's
 * Location step: distinct, non-empty `location` strings the acting user has
 * used on their own past events (created by them or they are tagged on), most
 * recent first. Reads the user's own department calendar — every event that
 * occupies a person carries a copy there — over the trailing months through
 * the sanctioned layered events cache (never raw `listEvents`), so the read
 * shares the data the dashboard shows and never mutates anything.
 *
 * By design a suggestion list, not a constraint: an empty/failed result simply
 * renders no chips, and the Location `TextInput` remains for custom values.
 */
export async function fetchRecentLocations(): Promise<string[]> {
  const session = await requireSession();
  try {
    const departmentId = await getUserDepartmentId(session.user.id);
    if (!departmentId) {
      return [];
    }
    const calendar = (await listCalendars()).find((row) => row.id === departmentId);
    if (!calendar) {
      return [];
    }

    const today = formatInstantToNaive(new Date());
    const currentMonth = today.slice(0, 7);
    const months: string[] = [];
    for (let i = 0; i < RECENT_LOCATIONS_MONTHS; i += 1) {
      months.push(shiftMonth(currentMonth, -i));
    }

    const cached = await getCachedMonthEventsForCalendarsMulti(
      [calendar.googleCalendarId],
      months,
    );

    // Most-recent-first: walk months newest → oldest, dedupe case-insensitively
    // so "Hall A" / "hall a" collapse, and cap at the configured bound.
    const seen = new Set<string>();
    const locations: string[] = [];
    for (const month of months) {
      const items = (cached.events[month]?.[calendar.googleCalendarId] ?? [])
        .slice()
        .sort((a, b) => b.start.getTime() - a.start.getTime());
      for (const item of items) {
        const location = item.location.trim();
        if (!location) {
          continue;
        }
        const people = parseEventPeople(item.description);
        const involved =
          people.creatorId === session.user.id || people.userIds.includes(session.user.id);
        if (!involved) {
          continue;
        }
        const key = location.toLocaleLowerCase();
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        locations.push(location);
        if (locations.length >= RECENT_LOCATIONS_MAX) {
          return locations;
        }
      }
    }
    return locations;
  } catch {
    // Suggestions are advisory only — never surface a read error to the wizard.
    return [];
  }
}
