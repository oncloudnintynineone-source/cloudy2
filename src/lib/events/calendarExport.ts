/**
 * Pure builders for the "Add to calendar" export: a prefilled Google Calendar
 * template URL and an RFC 5545 iCalendar (`.ics`) file body. Kept free of I/O so
 * they can be unit-tested without a browser, mirroring `src/lib/contacts/vcf.ts`.
 *
 * Event wall-clock times are Singapore (UTC+8) naive strings; both exports
 * convert them to absolute instants through the shared `datetime` helpers. The
 * entry title is the event's final rendered Google summary (`event.title`), so
 * a personal copy reads exactly like the department-calendar copy. All-day
 * events follow Google/ICS' exclusive end-date convention (the day after the
 * inclusive end date shown in the app), which `absEventRange` already applies.
 */

import { absEventRange } from "@/lib/events/datetime";
import type { CalendarEvent } from "@/lib/events/queries";

const pad = (value: number): string => String(value).padStart(2, "0");

/** Compact UTC `YYYYMMDDTHHmmssZ` stamp for a Google template / ICS datetime. */
function toUtcStamp(date: Date): string {
  return [
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`,
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`,
  ].join("");
}

/** `YYYYMMDD` date stamp from a UTC-midnight all-day instant. */
function toDateStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

/**
 * The human-readable free text carried into exports: the raw remarks the
 * organizer typed (`rawTitle`), never the opaque notes block stored in Google's
 * description field.
 */
function exportDescription(event: CalendarEvent): string {
  return event.payload.rawTitle?.trim() ?? "";
}

/**
 * Prefilled Google Calendar "create event" URL. Opens the user's Google
 * Calendar with the title, time, location, and remarks already filled in, so a
 * personal copy is one save away.
 */
export function buildGoogleCalendarUrl(event: CalendarEvent): string {
  const { start, end } = absEventRange(event.start, event.end, event.payload.allDay);
  const dates = event.payload.allDay
    ? `${toDateStamp(start)}/${toDateStamp(end)}`
    : `${toUtcStamp(start)}/${toUtcStamp(end)}`;
  const params = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates });
  const location = event.payload.location.trim();
  if (location) {
    params.set("location", location);
  }
  const details = exportDescription(event);
  if (details) {
    params.set("details", details);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escape an ICS text value (RFC 5545 §3.3.11): backslash, semicolon, comma, newline. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a content line to at most 75 octets per RFC 5545 §3.1, continuing with
 * CRLF + a single leading space. Folds on code-point boundaries so multi-byte
 * UTF-8 characters are never split (continuation lines reserve one octet for
 * the leading space).
 */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/**
 * The `.ics` file body for one event, CRLF-terminated. All-day events emit
 * `VALUE=DATE` entries; timed events emit UTC datetimes. `now` is injectable so
 * `DTSTAMP` is deterministic in tests.
 */
export function buildEventIcs(event: CalendarEvent, now: Date = new Date()): string {
  const { allDay, location } = event.payload;
  const { start, end } = absEventRange(event.start, event.end, allDay);
  const description = exportDescription(event);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//cloudy2//Cloud Calendar Movement//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(event.id)}@cloudy2`,
    `DTSTAMP:${toUtcStamp(now)}`,
    allDay ? `DTSTART;VALUE=DATE:${toDateStamp(start)}` : `DTSTART:${toUtcStamp(start)}`,
    allDay ? `DTEND;VALUE=DATE:${toDateStamp(end)}` : `DTEND:${toUtcStamp(end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];
  if (location) {
    lines.push(`LOCATION:${escapeIcsText(location)}`);
  }
  if (description) {
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/**
 * Filesystem-safe `.ics` filename derived from the event's final rendered
 * title, falling back to a neutral name when the title is empty or all
 * reserved characters.
 */
export function icsFileName(event: CalendarEvent): string {
  const base = event.title
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
    .trim();
  return `${base || "event"}.ics`;
}
