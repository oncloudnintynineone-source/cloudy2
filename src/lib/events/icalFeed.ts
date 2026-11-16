/**
 * Multi-event RFC 5545 iCalendar feed (the calendar-subscription body).
 *
 * Reuses the single-event export's pure primitives (`calendarExport.ts`) so
 * escaping/folding/all-day handling cannot drift. All-day (`full`/`half`)
 * events emit `VALUE=DATE` entries exactly like the single-event export; timed
 * events emit UTC datetimes. The feed is one `VEVENT` per logical event, keyed
 * by the group id so a multi-department copy never appears twice.
 *
 * Pure and I/O-free.
 */

import { exclusiveAbsEventRange } from "@/lib/events/datetime";
import { buildEventDeepLink } from "@/lib/events/deepLink";
import type { CalendarEvent } from "@/lib/events/queries";

import {
  escapeIcsText,
  foldIcsLine,
  toDateStamp,
  toUtcStamp,
} from "./calendarExport";

/** Safety cap: a ±3-month feed cannot grow unbounded. */
export const MAX_CALENDAR_FEED_EVENTS = 2_000;

export interface CalendarFeedInput {
  /** Calendar display name (rendered title of the feed). */
  calendarName: string;
  events: readonly CalendarEvent[];
  /** Dashboard view id carried by event deep links. */
  viewId: string;
  /** Absolute app origin, e.g. `https://app.example.com`. */
  origin: string;
  now?: Date;
}

function absoluteLink(origin: string, relative: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}${relative.startsWith("/") ? "" : "/"}${relative}`;
}

/**
 * The `.ics` subscription body, CRLF-terminated. `now` is injectable so
 * `DTSTAMP` is deterministic in tests.
 */
export function buildCalendarFeedIcs(input: CalendarFeedInput): string {
  const now = input.now ?? new Date();
  const stamp = toUtcStamp(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//cloudy2//Cloud Calendar Movement//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(input.calendarName)}`,
    "X-WR-TIMEZONE:Asia/Singapore",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];

  const seen = new Set<string>();
  for (const event of input.events) {
    if (seen.size >= MAX_CALENDAR_FEED_EVENTS) {
      break;
    }
    const uid = `${event.payload.eventId ?? event.id}@cloudy2`;
    if (seen.has(uid)) {
      continue;
    }
    seen.add(uid);

    const { allDay, location } = event.payload;
    const { start, end } = exclusiveAbsEventRange(event.start, event.end, allDay);
    const description = event.payload.rawTitle?.trim() ?? "";
    const deepLink = absoluteLink(
      input.origin,
      buildEventDeepLink({
        view: input.viewId,
        start: event.start,
        eventId: event.payload.eventId,
        calendarId: event.payload.calendarId,
      }),
    );

    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(uid)}`,
      `DTSTAMP:${stamp}`,
      allDay ? `DTSTART;VALUE=DATE:${toDateStamp(start)}` : `DTSTART:${toUtcStamp(start)}`,
      allDay ? `DTEND;VALUE=DATE:${toDateStamp(end)}` : `DTEND:${toUtcStamp(end)}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      "STATUS:CONFIRMED",
      "SEQUENCE:0",
      `URL:${escapeIcsText(deepLink)}`,
    );
    if (location.trim()) {
      lines.push(`LOCATION:${escapeIcsText(location)}`);
    }
    if (description) {
      lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
