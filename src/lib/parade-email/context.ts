/**
 * Server-side gathering of one day's parade-state snapshot for the daily
 * email. Reuses the same shared pure helpers as the parade page (day/event
 * matching, department sections) so the email and the UI agree. Reads the
 * cached calendar range — never the raw Google client.
 */

import { fetchMonthEvents, listCalendars } from "@/lib/events/queries";
import {
  buildEventsByUser,
  eventCoversDay,
  toParadeEvent,
  type ParadeEvent,
} from "@/lib/parade/dayEvents";
import { buildParadeSections, type ParadeSection } from "@/lib/parade/sections";
import { listUsers } from "@/lib/roster/queries";
import { getSettings } from "@/lib/settings/queries";

import type { ParadeEmailSection } from "./report";

export interface ParadeSnapshot {
  date: string;
  nameTemplate: string;
  sections: ParadeEmailSection[];
  /** Out-of-camp events per user (empty/absent = in camp). */
  eventsByUser: Map<string, ParadeEvent[]>;
}

function toEmailSection(section: ParadeSection<SnapshotUser>): ParadeEmailSection {
  return {
    name: section.name,
    users: section.users.map((user) => ({
      id: user.id,
      name: user.name,
      departmentName: user.departmentName,
    })),
    children: section.children.map(toEmailSection),
  };
}

interface SnapshotUser {
  id: string;
  name: string;
  departmentName: string | null;
  department: { id: string } | null;
}

/**
 * Load the org-wide snapshot for `date` (`YYYY-MM-DD`): every active roster
 * user grouped by department, with their out-of-camp events for that day.
 */
export async function loadParadeSnapshot(date: string): Promise<ParadeSnapshot> {
  const month = date.slice(0, 7);
  const [calendars, allUsers, settings] = await Promise.all([
    listCalendars(),
    listUsers(),
    getSettings(),
  ]);

  const events = await fetchMonthEvents({
    month,
    calendarIds: calendars.map((calendar) => calendar.id),
    typeFilter: [],
    userFilter: [],
  });

  const dayEvents = events.filter((event) => eventCoversDay(event, date)).map(toParadeEvent);
  const eventsByUser = buildEventsByUser(dayEvents);

  const activeUsers: SnapshotUser[] = allUsers
    .filter((user) => user.status === "active")
    .map((user) => ({
      id: user.id,
      name: user.name,
      departmentName: user.department?.name ?? null,
      department: user.department ? { id: user.department.id } : null,
    }));

  const sections = buildParadeSections(activeUsers, calendars).map(toEmailSection);

  return {
    date,
    nameTemplate: settings.nameTemplate,
    sections,
    eventsByUser,
  };
}
