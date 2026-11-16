/**
 * Pure shaping for the widget API: turn the dashboard view's projected events
 * into a compact, flat, widget-friendly agenda. Kept I/O-free so the window
 * math, all-day handling, labels and flat aliases are unit-tested without a
 * database.
 *
 * Times are the app's fixed UTC+8 naive strings (`YYYY-MM-DD HH:mm:ss`); display
 * strings are precomputed because KWGT cannot do date math cheaply. The `flat`
 * object exists because KWGT's JSONPath handling of arrays is awkward — every
 * field a template needs has a scalar alias (`nextTitle`, `e1Title`, …).
 */

import { addDays, dateToUtc, daysUntilDate, subOneDay } from "@/lib/events/datetime";
import { buildEventDeepLink } from "@/lib/events/deepLink";
import type { CalendarEvent } from "@/lib/events/queries";

export const WIDGET_DEFAULT_DAYS = 7;
export const WIDGET_MAX_DAYS = 14;
/** How many agenda rows the JSON ships (widgets show far fewer). */
export const WIDGET_MAX_EVENTS = 30;
/** How many rows get scalar `e1…` aliases in `flat`. */
export const WIDGET_FLAT_EVENTS = 6;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Clamp the `?days=` window (1–14, default 7). Bad input falls back, never errors. */
export function clampWidgetDays(raw: unknown): number {
  const value =
    typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
  if (!Number.isFinite(value)) {
    return WIDGET_DEFAULT_DAYS;
  }
  return Math.min(WIDGET_MAX_DAYS, Math.max(1, Math.trunc(value)));
}

/** `16 Nov` (no year). */
export function dayMonthLabel(date: string): string {
  const day = dateToUtc(date);
  return `${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`;
}

/**
 * `Today` / `Tomorrow` / `Yesterday` / `Mon 18 Nov` (with the year when it is
 * not the current one). Pure and date-only.
 */
export function relativeDayLabel(date: string, today: string): string {
  if (date === today) {
    return "Today";
  }
  if (date === addDays(today, 1)) {
    return "Tomorrow";
  }
  if (date === subOneDay(today)) {
    return "Yesterday";
  }
  const day = dateToUtc(date);
  const base = `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`;
  return date.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${date.slice(0, 4)}`;
}

/**
 * The last civil day an event occupies (inclusive). All-day / full / half-day
 * events store an exclusive UTC-midnight end, and a timed event ending exactly
 * at midnight occupies only the prior day — so both step back one day.
 */
export function eventEndDateInclusive(event: CalendarEvent): string {
  const startDate = event.start.slice(0, 10);
  const endDate = event.end.slice(0, 10);
  if (!startDate || !endDate) {
    return startDate;
  }
  const endTime = event.end.slice(11, 19);
  const civilBasis = event.payload.allDay || event.payload.timeOption !== "range";
  if (civilBasis || (endDate > startDate && endTime === "00:00:00")) {
    return subOneDay(endDate);
  }
  return endDate;
}

/** Whether an event occupies at least one day in `[today, lastDay]`. */
export function eventInWindow(event: CalendarEvent, today: string, lastDay: string): boolean {
  const startDate = event.start.slice(0, 10);
  const endDate = eventEndDateInclusive(event);
  return startDate <= lastDay && endDate >= today;
}

/** The display time: `All day`, `AM–PM`, or `09:00–10:00`. */
export function eventTimeLabel(event: CalendarEvent): string {
  const { timeOption, startAmPm, endAmPm, allDay } = event.payload;
  if (timeOption === "half" && startAmPm && endAmPm) {
    return startAmPm === endAmPm ? startAmPm : `${startAmPm}–${endAmPm}`;
  }
  if (allDay) {
    return "All day";
  }
  const start = event.start.slice(11, 16);
  const end = event.end.slice(11, 16);
  return end && end !== start ? `${start}–${end}` : start;
}

/** The one-line schedule label used by the widget rows. */
export function eventWhenLabel(event: CalendarEvent, today: string): string {
  const startDate = event.start.slice(0, 10);
  const endDate = eventEndDateInclusive(event);
  const time = eventTimeLabel(event);
  if (startDate < today) {
    return `Ongoing until ${relativeDayLabel(endDate, today)}`;
  }
  if (endDate > startDate) {
    return `${relativeDayLabel(startDate, today)} – ${relativeDayLabel(endDate, today)}`;
  }
  if (event.payload.timeOption === "half") {
    return `${relativeDayLabel(startDate, today)} (${time})`;
  }
  if (event.payload.allDay) {
    return `${relativeDayLabel(startDate, today)} (all day)`;
  }
  return `${relativeDayLabel(startDate, today)} ${time}`;
}

export interface WidgetAgendaEvent {
  /** Logical event group id, or the copy id for legacy/external events. */
  id: string;
  title: string;
  date: string;
  endDate: string;
  dateLabel: string;
  endDateLabel: string;
  time: string;
  when: string;
  allDay: boolean;
  ongoing: boolean;
  location: string;
  calendar: string;
  color: string;
  pinned: boolean;
  /** Whole calendar days from today to the event's start (0 = today). */
  daysUntil: number;
  /** Absolute dashboard deep link, or null when there is no stable target. */
  deepLink: string | null;
}

export function absoluteLink(relative: string, origin: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}${relative.startsWith("/") ? "" : "/"}${relative}`;
}

function eventDeepLink(
  event: CalendarEvent,
  params: { viewId: string; origin: string },
): string | null {
  const relative = buildEventDeepLink({
    view: params.viewId,
    start: event.start,
    eventId: event.payload.eventId,
    calendarId: event.payload.calendarId,
  });
  return absoluteLink(relative, params.origin);
}

export function shapeWidgetEvent(
  event: CalendarEvent,
  params: { viewId: string; origin: string; today: string },
): WidgetAgendaEvent {
  const startDate = event.start.slice(0, 10);
  const endDate = eventEndDateInclusive(event);
  return {
    id: event.payload.eventId ?? event.id,
    title: event.title,
    date: startDate,
    endDate,
    dateLabel: relativeDayLabel(startDate, params.today),
    endDateLabel: relativeDayLabel(endDate, params.today),
    time: eventTimeLabel(event),
    when: eventWhenLabel(event, params.today),
    allDay: event.payload.allDay,
    ongoing: startDate < params.today,
    location: event.payload.location ?? "",
    calendar: event.payload.calendarName,
    color: event.color,
    pinned:
      event.payload.pinned || (event.payload.pinnedDepartments?.length ?? 0) > 0,
    daysUntil: daysUntilDate(params.today, startDate),
    deepLink: eventDeepLink(event, params),
  };
}

export interface WidgetAgendaSummary {
  events: WidgetAgendaEvent[];
  next: WidgetAgendaEvent | null;
  counts: { today: number; window: number };
}

/** Filter to the window, order chronologically and cap the payload. */
export function shapeWidgetAgenda(
  events: readonly CalendarEvent[],
  params: { viewId: string; origin: string; today: string; lastDay: string },
): WidgetAgendaSummary {
  const sorted = [...events].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const shaped = sorted
    .filter((event) => eventInWindow(event, params.today, params.lastDay))
    .map((event) => shapeWidgetEvent(event, params));
  return {
    events: shaped.slice(0, WIDGET_MAX_EVENTS),
    next: shaped[0] ?? null,
    counts: {
      today: shaped.filter((event) => event.date <= params.today && event.endDate >= params.today)
        .length,
      window: shaped.length,
    },
  };
}

/** The subset of the pinned read the widget needs (avoids importing I/O). */
export interface WidgetPinnedLike {
  title: string;
  start: string;
  eventId: string | null;
  calendarId: string;
}

export interface WidgetPinnedNext {
  title: string;
  daysLeft: number;
  date: string;
  dateLabel: string;
  deepLink: string;
}

export interface WidgetPinnedSummary {
  count: number;
  next: WidgetPinnedNext | null;
}

export function shapeWidgetPinned(
  pins: readonly WidgetPinnedLike[],
  params: { viewId: string; origin: string; today: string },
): WidgetPinnedSummary {
  const shaped = pins.map((pin) => {
    const date = pin.start.slice(0, 10);
    return {
      title: pin.title,
      daysLeft: daysUntilDate(params.today, date),
      date,
      dateLabel: relativeDayLabel(date, params.today),
      deepLink: absoluteLink(
        buildEventDeepLink({
          view: params.viewId,
          start: pin.start,
          eventId: pin.eventId,
          calendarId: pin.calendarId,
        }),
        params.origin,
      ),
    };
  });
  return { count: shaped.length, next: shaped[0] ?? null };
}

export interface WidgetFlatInput {
  updatedLabel: string;
  viewName: string;
  viewKind: string;
  todayLabel: string;
  events: readonly WidgetAgendaEvent[];
  pinned: WidgetPinnedSummary;
  /** Dashboard fallback link when there is no single event target. */
  fallbackLink: string;
}

/**
 * Scalar aliases for KWGT formulas. KWGT's JSONPath array handling is fragile,
 * so every row it can render is also exposed as `e1Title`, `e1When`, … and the
 * next event / pinned next as `next*` / `pinnedNext*`.
 */
export function buildWidgetFlat(input: WidgetFlatInput): Record<string, string> {
  const first = input.events[0] ?? null;
  const flat: Record<string, string> = {
    updatedLabel: input.updatedLabel,
    viewName: input.viewName,
    viewKind: input.viewKind,
    todayLabel: input.todayLabel,
    eventCount: String(input.events.length),
    nextTitle: first?.title ?? "No upcoming events",
    nextWhen: first?.when ?? "",
    nextWhere: first ? first.location || first.calendar : "",
    nextDate: first?.date ?? "",
    nextTime: first?.time ?? "",
    nextLink: first?.deepLink ?? input.fallbackLink,
    pinnedCount: String(input.pinned.count),
    pinnedNextTitle: input.pinned.next?.title ?? "",
    pinnedNextWhen: input.pinned.next ? `${input.pinned.next.daysLeft}d` : "",
    pinnedNextDate: input.pinned.next?.date ?? "",
    pinnedNextLink: input.pinned.next?.deepLink ?? "",
  };
  input.events.slice(0, WIDGET_FLAT_EVENTS).forEach((event, index) => {
    const key = `e${index + 1}`;
    flat[`${key}Title`] = event.title;
    flat[`${key}When`] = event.when;
    flat[`${key}Where`] = event.location || event.calendar;
    flat[`${key}Date`] = event.date;
    flat[`${key}Time`] = event.time;
    flat[`${key}Link`] = event.deepLink ?? input.fallbackLink;
  });
  return flat;
}
