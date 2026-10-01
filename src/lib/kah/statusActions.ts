"use server";

import {
  addOneDay,
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
  DEFAULT_KAH_RANGE_MONTHS,
  kahForwardWindow,
  parseKahRange,
  type KahStatusViewData,
} from "@/lib/kah/range";
import {
  busyDaysInRange,
  kahBreachEpisodes,
  kahGroupsForUser,
  kahStatusForWindow,
  listKahGroupChecks,
  overseasEventEntriesInRange,
  overseasEventsInRange,
} from "@/lib/kah/status";
import { buildKahStatusViewData } from "@/lib/kah/viewData";
import { listUsers } from "@/lib/roster/queries";
import { requireSession } from "@/lib/session";

export type KahBreachCountResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * The KAH Status nav badge count: how many distinct breach *periods* (maximal
 * runs of consecutive breached days) the viewer's groups have from today
 * through the end of the month `DEFAULT_KAH_RANGE_MONTHS` months ahead — the
 * same forward-only window the `/kah-status` page opens on. Admins count every
 * group's periods combined, matching the groups their page lists; members count
 * only their own. A group breaching in two separate runs counts twice.
 *
 * Uses the same per-day math as the page (`overseasEventsInRange` →
 * `busyDaysInRange` → `kahStatusForWindow` → pure `kahBreachEpisodes`), never
 * a union-only shortcut, so the badge can't diverge from the page. A
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

    // Forward-only window: `[today 00:00, first day after the window 00:00)`.
    const today = formatInstantToNaive(new Date()).slice(0, 10);
    const { windowStart, windowEnd } = kahForwardWindow(today, DEFAULT_KAH_RANGE_MONTHS);
    const days = daysBetween(windowStart, windowEnd);
    const events = await overseasEventsInRange(
      parseNaiveToInstant(`${windowStart} 00:00:00`),
      parseNaiveToInstant(`${addOneDay(windowEnd)} 00:00:00`),
    );
    const perDay = busyDaysInRange(events, days).map((day) => ({
      date: day.date,
      statuses: kahStatusForWindow(groups, new Set(day.awayIds)),
    }));
    return { ok: true, count: kahBreachEpisodes(perDay, today).length };
  } catch (error) {
    console.error("[kah] Breach count failed", error);
    return { ok: false, error: "Could not check KAH breaches" };
  }
}

export type KahStatusViewResult =
  | { ok: true; data: KahStatusViewData }
  | { ok: false; error: string };

/**
 * Rebuild the `/kah-status` view data for a newly selected look-ahead. The
 * range is chosen per view (never persisted): the page's initial render uses
 * the default range, and this action serves dropdown changes. The untrusted
 * range is coerced with `parseKahRange` (default on garbage), and the same
 * `buildKahStatusViewData` the page uses keeps the two identical.
 */
export async function getKahStatusView(input: {
  rangeMonths: number;
}): Promise<KahStatusViewResult> {
  const session = await requireSession();
  try {
    const data = await buildKahStatusViewData({
      userId: session.user.id,
      role: session.user.role,
      rangeMonths: parseKahRange(input.rangeMonths),
    });
    return { ok: true, data };
  } catch (error) {
    console.error("[kah] Status view failed", error);
    return { ok: false, error: "Could not load KAH status" };
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
