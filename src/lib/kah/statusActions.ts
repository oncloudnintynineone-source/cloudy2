"use server";

import {
  addDays,
  daysBetween,
  formatInstantToNaive,
  monthsInRange,
  parseNaiveToInstant,
} from "@/lib/events/datetime";
import { findEventByGroupId } from "@/lib/events/deepLink";
import { shapeClashDetail } from "@/lib/events/clashDetail";
import type { ClashEventDetailResult } from "@/lib/events/clashActions";
import { fetchRangeEvents } from "@/lib/events/queries";
import {
  KAH_BADGE_LOOKAHEAD_DAYS,
  breachedGroupCount,
  busyDaysInRange,
  kahGroupsForUser,
  kahStatusForWindow,
  listKahGroupChecks,
  overseasEventEntriesInRange,
  overseasEventsInRange,
} from "@/lib/kah/status";
import { listUsers } from "@/lib/roster/queries";
import { requireSession } from "@/lib/session";

export type KahBreachCountResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * The KAH Status nav badge count: how many of the viewer's groups breach on at
 * least one day from today through the next `KAH_BADGE_LOOKAHEAD_DAYS` days —
 * the same forward-looking advisory shape as Double Booking's 30-day scan.
 * Admins count every group, matching the groups their `/kah-status` page lists;
 * members count only their own. A group breaching on several days counts once.
 *
 * Uses the same per-day math as the `/kah-status` page (`overseasEventsInRange`
 * → `busyDaysInRange` → `kahStatusForWindow`), never the union-only
 * `busyKahsIn`, so the badge can't diverge from the page's day-level status. A
 * read-only scan over the cached month reads — never writes or audits.
 */
export async function checkKahBreaches(): Promise<KahBreachCountResult> {
  const session = await requireSession();
  try {
    const isAdmin = session.user.role === "admin";
    const groups = isAdmin
      ? await listKahGroupChecks()
      : await kahGroupsForUser(session.user.id);
    if (groups.length === 0) {
      return { ok: true, count: 0 };
    }

    // Forward window, today inclusive: `KAH_BADGE_LOOKAHEAD_DAYS` civil days,
    // read as the half-open instant range [today 00:00, today + N 00:00).
    const today = formatInstantToNaive(new Date()).slice(0, 10);
    const days = daysBetween(today, addDays(today, KAH_BADGE_LOOKAHEAD_DAYS - 1));
    const events = await overseasEventsInRange(
      parseNaiveToInstant(`${today} 00:00:00`),
      parseNaiveToInstant(`${addDays(today, KAH_BADGE_LOOKAHEAD_DAYS)} 00:00:00`),
    );
    const perDay = busyDaysInRange(events, days).map((day) => ({
      date: day.date,
      statuses: kahStatusForWindow(groups, new Set(day.awayIds)),
    }));
    return { ok: true, count: breachedGroupCount(perDay) };
  } catch (error) {
    console.error("[kah] Breach count failed", error);
    return { ok: false, error: "Could not check KAH breaches" };
  }
}

/**
 * Read-only fetch of one KAH-causing event for the `/kah-status` breach cards'
 * in-place detail modal. Admins may resolve any KAH-relevant overseas event;
 * members only events that take one of their groups' active members away.
 *
 * The requested copy is verified against the enriched overseas read for its own
 * effective window, so an arbitrary (calendar, event) pair can never be
 * resolved through this action. The full copy is then read through the
 * sanctioned month cache (`fetchRangeEvents`, never raw `listEvents`) and shaped
 * by the shared `shapeClashDetail`, exactly like the Double Booking page.
 */
export async function getKahBreachEventDetail(request: {
  calendarId: string;
  eventId: string | null;
  googleEventId: string;
  /** Effective (half-open) occupancy window of the tapped copy. */
  startNaive: string;
  endNaive: string;
}): Promise<ClashEventDetailResult> {
  const session = await requireSession();
  try {
    const isAdmin = session.user.role === "admin";
    const groups = isAdmin ? [] : await kahGroupsForUser(session.user.id);
    if (!isAdmin && groups.length === 0) {
      return { ok: false, error: "Event not found" };
    }

    const relevant = await overseasEventEntriesInRange(
      parseNaiveToInstant(request.startNaive),
      parseNaiveToInstant(request.endNaive),
    );
    const match = relevant.find(
      (event) =>
        event.calendarId === request.calendarId && event.googleEventId === request.googleEventId,
    );
    if (!match) {
      return { ok: false, error: "Event not found" };
    }
    if (!isAdmin) {
      const memberIds = new Set(groups.flatMap((group) => group.memberIds));
      if (!match.userIds.some((id) => memberIds.has(id))) {
        return { ok: false, error: "Event not found" };
      }
    }

    const events = await fetchRangeEvents({
      months: monthsInRange(request.startNaive, request.endNaive),
      calendarIds: [request.calendarId],
      typeFilter: [],
      userFilter: [],
    });
    const event = request.eventId
      ? findEventByGroupId(events, request.eventId)
      : (events.find((candidate) => candidate.payload.googleEventId === request.googleEventId) ??
        null);
    if (!event) {
      return { ok: false, error: "Event not found" };
    }

    const users = await listUsers();
    const activeUsers = users.filter((user) => user.status === "active");
    return { ok: true, ...(await shapeClashDetail(event, activeUsers, session.user.id)) };
  } catch (error) {
    console.error("[kah] Breach event detail failed", error);
    return { ok: false, error: "Could not load the event" };
  }
}
