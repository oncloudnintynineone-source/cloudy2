import { describe, expect, it } from "vitest";

import { buildCalendarFeedIcs } from "./icalFeed";
import type { CalendarEvent } from "./queries";

const NOW = new Date("2026-09-17T03:04:05Z");
const ORIGIN = "https://app.example.com";
const VIEW = "v1";

function makeEvent(
  overrides: {
    id?: string;
    eventId?: string | null;
    title?: string;
    start?: string;
    end?: string;
    allDay?: boolean;
    timeOption?: "range" | "full" | "half";
    location?: string;
    rawTitle?: string | null;
    calendarId?: string;
  } = {},
): CalendarEvent {
  const allDay = overrides.allDay ?? false;
  const title = overrides.title ?? "Range Practice";
  return {
    id: overrides.id ?? "cal-1:g-1",
    title,
    start: overrides.start ?? "2026-08-17 09:00:00",
    end: overrides.end ?? "2026-08-17 10:30:00",
    color: "blue",
    payload: {
      calendarId: overrides.calendarId ?? "cal-1",
      googleEventId: "g-1",
      allDay,
      eventType: null,
      calendarName: "Dept A",
      eventId: overrides.eventId === undefined ? "evt-1" : overrides.eventId,
      creatorId: null,
      inviteeUserIds: [],
      inviteeDepartmentIds: [],
      ownerOnlyEdits: false,
      registrationEnabled: false,
      registrationCap: null,
      rawTitle: overrides.rawTitle ?? null,
      timeOption: overrides.timeOption ?? (allDay ? "full" : "range"),
      startAmPm: null,
      endAmPm: null,
      outOfCamp: false,
      overseas: false,
      pinned: false,
      location: overrides.location ?? "",
      external: false,
    },
  };
}

function build(events: CalendarEvent[], calendarName = "Cloudy2 · Agenda") {
  return buildCalendarFeedIcs({ calendarName, events, viewId: VIEW, origin: ORIGIN, now: NOW });
}

describe("buildCalendarFeedIcs", () => {
  it("emits calendar metadata and CRLF-terminated lines", () => {
    const ics = build([]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("X-WR-CALNAME:Cloudy2 · Agenda");
    expect(ics).toContain("X-WR-TIMEZONE:Asia/Singapore");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT15M");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("emits UTC datetimes for a timed event and a dashboard URL", () => {
    const ics = build([makeEvent()]);
    expect(ics).toContain("UID:evt-1@cloudy2");
    expect(ics).toContain("DTSTAMP:20260917T030405Z");
    expect(ics).toContain("DTSTART:20260817T010000Z");
    expect(ics).toContain("DTEND:20260817T023000Z");
    expect(ics).toContain("SUMMARY:Range Practice");
    expect(ics).toContain("STATUS:CONFIRMED");
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(
      "URL:https://app.example.com/dashboard?view=v1&date=2026-08-17&event=evt-1&_eventCal=cal-1",
    );
  });

  it("emits VALUE=DATE entries with the exclusive end for all-day events", () => {
    const ics = build([
      makeEvent({
        start: "2026-08-17 00:00:00",
        end: "2026-08-18 00:00:00",
        allDay: true,
      }),
    ]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260817");
    expect(ics).toContain("DTEND;VALUE=DATE:20260818");
  });

  it("keeps a multi-day span intact", () => {
    const ics = build([
      makeEvent({
        start: "2026-08-17 00:00:00",
        end: "2026-08-20 00:00:00",
        allDay: true,
      }),
    ]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260817");
    expect(ics).toContain("DTEND;VALUE=DATE:20260820");
  });

  it("includes location and remarks, and folds long values", () => {
    const ics = build([
      makeEvent({
        location: "Live Firing Range",
        rawTitle: "会".repeat(60),
      }),
    ]);
    expect(ics).toContain("LOCATION:Live Firing Range");
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`DESCRIPTION:${"会".repeat(60)}`);
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("escapes reserved characters", () => {
    const ics = build([makeEvent({ title: "A;B,C\nD" })]);
    expect(ics).toContain("SUMMARY:A\\;B\\,C\\nD");
  });

  it("dedupes copies of the same logical event by group id", () => {
    const ics = build([
      makeEvent({ id: "cal-1:g-1", calendarId: "cal-1" }),
      makeEvent({ id: "cal-2:g-2", calendarId: "cal-2" }),
    ]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("uses the copy id for legacy events without a group id", () => {
    const ics = build([makeEvent({ id: "cal-1:legacy", eventId: null })]);
    expect(ics).toContain("UID:cal-1:legacy@cloudy2");
  });
});
