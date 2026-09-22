/**
 * Shared shaping for a single event's in-place read-only detail payload, used by
 * the Double Booking page's `getClashEventDetail`, the wizard advisory's
 * `getWizardClashEventDetail`, and the KAH status page's
 * `getKahBreachEventDetail`. Server-side only (reads settings, calendars and the
 * roster) but deliberately NOT a `"use server"` module so it is a plain helper,
 * never an exposed action.
 *
 * Kept out of `clashActions.ts` (a `"use server"` module, where every export must
 * be a server action) so the KAH action can reuse it without exposing it.
 */

import type { CalendarEvent } from "@/lib/events/queries";
import { listCalendars } from "@/lib/events/queries";
import type { listUsers } from "@/lib/roster/queries";
import { formatFullName } from "@/lib/settings/formatName";
import { getSettings } from "@/lib/settings/queries";

/** An active roster row (the shape `listUsers` returns). */
type RosterUserRow = Awaited<ReturnType<typeof listUsers>>[number];

/** The read-only detail payload the shared `EventDetail` needs. */
export interface ClashDetailPayload {
  /** The full schedule-ready event, for the in-place detail modal. */
  event: CalendarEvent;
  /** Active-roster user id → display name (owner/participants). */
  peopleNames: Record<string, string>;
  /** Calendar (department) id → display name. */
  calendarNames: Record<string, string>;
  /** The acting user's active department ids (mirrors the dashboard's edit check). */
  myActiveDepartmentIds: string[];
}

/**
 * Shape a resolved event copy into the in-place detail modal payload: the full
 * event plus the active-roster name maps and the acting user's department ids.
 */
export async function shapeClashDetail(
  event: CalendarEvent,
  activeUsers: RosterUserRow[],
  sessionUserId: string,
): Promise<ClashDetailPayload> {
  const [settings, calendars] = await Promise.all([getSettings(), listCalendars()]);
  const peopleNames: Record<string, string> = Object.fromEntries(
    activeUsers.map((user) => [
      user.id,
      formatFullName(
        { name: user.name, departmentName: user.department?.name ?? null },
        settings.nameTemplate,
      ),
    ]),
  );
  const calendarNames: Record<string, string> = Object.fromEntries(
    calendars.map((calendar) => [calendar.id, calendar.name]),
  );
  const self = activeUsers.find((user) => user.id === sessionUserId);
  return {
    event,
    peopleNames,
    calendarNames,
    myActiveDepartmentIds: self?.department?.id ? [self.department.id] : [],
  };
}
