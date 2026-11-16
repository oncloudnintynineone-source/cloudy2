/**
 * Server-side builder for the calendar-feed subscription
 * (`GET /api/widget/v1/calendar.ics`).
 *
 * Reads the chosen dashboard view's ±3-month window through the same layered
 * events cache as the dashboard, applies the view's filters/title recipe, then
 * renders one RFC 5545 feed. Kept separate from the cached wrapper
 * (`feedCache.ts`) so the read/ICS shaping is easy to reason about and
 * unit-test.
 */

import { buildCalendarFeedIcs } from "@/lib/events/icalFeed";

import { eventInFeedWindow, widgetFeedWindow } from "./feedWindow";
import { readWidgetViewEvents, resolveWidgetView } from "./viewEvents";

/** The user a feed build runs as (resolved from the signed URL, not a session). */
export interface WidgetActor {
  id: string;
  role: "admin" | "user";
}

export interface BuiltCalendarFeed {
  body: string;
  calendarName: string;
  /** The resolved dashboard view id (may differ if the requested view was deleted). */
  viewId: string;
  eventCount: number;
}

export async function buildCalendarFeed(params: {
  actor: WidgetActor;
  /** The requested view id from the signed URL. */
  viewId: string;
  /** Absolute app origin for event deep links. */
  origin: string;
  now?: Date;
}): Promise<BuiltCalendarFeed> {
  const config = await resolveWidgetView(params.actor, params.viewId);
  const window = widgetFeedWindow(params.now);
  const events = await readWidgetViewEvents(config, window.readMonths);
  const inWindow = events.filter((event) => eventInFeedWindow(event, window));
  const calendarName = `Cloudy2 · ${config.tab.name}`;
  const body = buildCalendarFeedIcs({
    calendarName,
    calendarDescription: `Filters: ${config.filterSummary}`,
    events: inWindow,
    viewId: config.tab.id,
    origin: params.origin,
    now: params.now,
  });
  return { body, calendarName, viewId: config.tab.id, eventCount: inWindow.length };
}
