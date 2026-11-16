/**
 * Server-side builder for the widget agenda (`GET /api/widget/v1/agenda`).
 *
 * A widget is bound to one dashboard view: it reuses that view's **filters**
 * (calendars / users / event types / event-name text) and its **title recipe**,
 * then renders a forward agenda for `today … today + days - 1` regardless of
 * the view's own renderer kind. This deliberately does not call
 * `buildDashboardData`: its month set is anchored to the view's grid (a Week or
 * Day view reads one month), which would miss the tail of a forward window that
 * crosses a month boundary.
 *
 * Reads go through the same layered events cache as every other calendar
 * surface, so a widget tap never fans out to Google on a warm cache. The
 * previous month is included in the read so an event that started before today
 * (multi-day, or an early-morning SGT event stored under the prior UTC month)
 * still appears as ongoing.
 */

import { addDays, formatInstantToNaive, monthsInRange, shiftMonth } from "@/lib/events/datetime";
import { fetchPinnedEventsFor } from "@/lib/events/pinned";

import {
  absoluteLink,
  buildWidgetFlat,
  clampWidgetDays,
  dayMonthLabel,
  relativeDayLabel,
  shapeWidgetAgenda,
  shapeWidgetPinned,
  type WidgetAgendaEvent,
  type WidgetPinnedLike,
  type WidgetPinnedSummary,
} from "./shape";
import { readWidgetViewEvents, resolveWidgetView } from "./viewEvents";
import type { WidgetActor } from "./auth";

export interface WidgetAgendaResponse {
  ok: true;
  v: 1;
  /** Server wall clock (UTC+8) of this read. */
  generatedAt: string;
  today: string;
  window: { start: string; end: string; days: number };
  user: { name: string; department: string };
  view: { id: string; name: string; kind: string };
  next: WidgetAgendaEvent | null;
  events: WidgetAgendaEvent[];
  counts: { today: number; window: number };
  pinned: WidgetPinnedSummary;
  flat: Record<string, string>;
}

export async function buildWidgetAgenda(params: {
  actor: WidgetActor;
  /** A dashboard view id or legacy kind string; null = first tab. */
  view: string | null;
  days: number;
  /** Absolute app origin for deep links (no trailing slash required). */
  origin: string;
  now?: Date;
}): Promise<WidgetAgendaResponse> {
  const config = await resolveWidgetView(params.actor, params.view);
  const { tab } = config;

  const now = params.now ?? new Date();
  const generatedAt = formatInstantToNaive(now);
  const today = generatedAt.slice(0, 10);
  const days = clampWidgetDays(params.days);
  const lastDay = addDays(today, days - 1);
  // Previous month too: catches multi-day events that started before today and
  // early-morning SGT events stored under the prior UTC month (see deepLink.ts).
  const months = [
    ...new Set([shiftMonth(today.slice(0, 7), -1), ...monthsInRange(today, lastDay)]),
  ].sort();

  const filtered = await readWidgetViewEvents(config, months);

  const summary = shapeWidgetAgenda(filtered, {
    viewId: tab.id,
    origin: params.origin,
    today,
    lastDay,
  });

  let pins: WidgetPinnedLike[] = [];
  try {
    const fetched = await fetchPinnedEventsFor({ id: params.actor.id, role: params.actor.role });
    pins = fetched.map((pin) => ({
      title: pin.title,
      start: pin.start,
      eventId: pin.eventId,
      calendarId: pin.calendarId,
    }));
  } catch (error) {
    // Pinned data is a bonus; an agenda read must not fail because of it.
    console.error("[widgets] Pinned read failed", error);
  }
  const pinned = shapeWidgetPinned(pins, {
    viewId: tab.id,
    origin: params.origin,
    today,
  });

  const me = config.allUsers.find((user) => user.id === params.actor.id);
  const fallbackLink = absoluteLink(`/dashboard?view=${encodeURIComponent(tab.id)}`, params.origin);

  return {
    ok: true,
    v: 1,
    generatedAt,
    today,
    window: { start: today, end: lastDay, days },
    user: {
      name: me?.name ?? params.actor.name,
      department: me?.department?.name ?? "",
    },
    view: { id: tab.id, name: tab.name, kind: tab.kind },
    next: summary.next,
    events: summary.events,
    counts: summary.counts,
    pinned,
    flat: buildWidgetFlat({
      updatedLabel: `Updated ${dayMonthLabel(today)} ${generatedAt.slice(11, 16)}`,
      viewName: tab.name,
      viewKind: tab.kind,
      todayLabel: `${relativeDayLabel(today, today)} ${dayMonthLabel(today)}`,
      events: summary.events,
      pinned,
      fallbackLink,
    }),
  };
}
