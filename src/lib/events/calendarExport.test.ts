import { describe, expect, it } from "vitest";

import { buildEventIcs, buildGoogleCalendarUrl, icsFileName } from "./calendarExport";
import type { CalendarEvent } from "./queries";

function makeEvent(
  opts: {
    id?: string;
    title?: string;
    start?: string;
    end?: string;
    allDay?: boolean;
    timeOption?: "range" | "full" | "half";
    location?: string;
    rawTitle?: string | null;
  } = {},
): CalendarEvent {
  const allDay = opts.allDay ?? false;
  return {
    id: opts.id ?? "cal-1:g-1",
    title: opts.title ?? "Range Practice",
    start: opts.start ?? "2026-08-17 09:00:00",
    end: opts.end ?? "2026-08-17 10:30:00",
    color: "blue",
    payload: {
      calendarId: "cal-1",
      googleEventId: "g-1",
      allDay,
      eventType: null,
      calendarName: "Dept A",
      eventId: "evt-1",
      creatorId: null,
      inviteeUserIds: [],
      inviteeDepartmentIds: [],
      ownerOnlyEdits: false,
      rawTitle: opts.rawTitle ?? null,
      timeOption: opts.timeOption ?? (allDay ? "full" : "range"),
      startAmPm: null,
      endAmPm: null,
      outOfCamp: false,
      overseas: false,
      pinned: false,
      location: opts.location ?? "",
      external: false,
    },
  };
}

describe("buildGoogleCalendarUrl", () => {
  it("prefills a timed event in UTC", () => {
    const url = new URL(buildGoogleCalendarUrl(makeEvent()));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Range Practice");
    expect(url.searchParams.get("dates")).toBe("20260817T010000Z/20260817T023000Z");
  });

  it("uses the exclusive end date for all-day events", () => {
    const event = makeEvent({
      start: "2026-08-17 00:00:00",
      end: "2026-08-18 00:00:00",
      allDay: true,
    });
    expect(new URL(buildGoogleCalendarUrl(event)).searchParams.get("dates")).toBe(
      "20260817/20260818",
    );
  });

  it("keeps a multi-day all-day span intact", () => {
    const event = makeEvent({
      start: "2026-08-17 00:00:00",
      end: "2026-08-20 00:00:00",
      allDay: true,
    });
    expect(new URL(buildGoogleCalendarUrl(event)).searchParams.get("dates")).toBe(
      "20260817/20260820",
    );
  });

  it("copies a half-day event as a full all-day block", () => {
    const event = makeEvent({
      start: "2026-08-15 00:00:00",
      end: "2026-08-16 00:00:00",
      allDay: true,
      timeOption: "half",
    });
    expect(new URL(buildGoogleCalendarUrl(event)).searchParams.get("dates")).toBe(
      "20260815/20260816",
    );
  });

  it("includes location and remarks when present", () => {
    const event = makeEvent({ location: "Live Firing Range", rawTitle: "Bring ear plugs" });
    const params = new URL(buildGoogleCalendarUrl(event)).searchParams;
    expect(params.get("location")).toBe("Live Firing Range");
    expect(params.get("details")).toBe("Bring ear plugs");
  });

  it("omits location and details when empty", () => {
    const params = new URL(buildGoogleCalendarUrl(makeEvent())).searchParams;
    expect(params.has("location")).toBe(false);
    expect(params.has("details")).toBe(false);
  });
});

describe("buildEventIcs", () => {
  const NOW = new Date("2026-09-17T03:04:05Z");

  it("emits a UTC VEVENT for a timed event", () => {
    const ics = buildEventIcs(makeEvent(), NOW);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTAMP:20260917T030405Z");
    expect(ics).toContain("DTSTART:20260817T010000Z");
    expect(ics).toContain("DTEND:20260817T023000Z");
    expect(ics).toContain("SUMMARY:Range Practice");
    expect(ics).toContain("END:VEVENT");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("emits VALUE=DATE entries for an all-day event", () => {
    const event = makeEvent({
      start: "2026-08-17 00:00:00",
      end: "2026-08-18 00:00:00",
      allDay: true,
    });
    const ics = buildEventIcs(event, NOW);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260817");
    expect(ics).toContain("DTEND;VALUE=DATE:20260818");
  });

  it("escapes reserved characters in text values", () => {
    const event = makeEvent({ title: "A;B,C\nD" });
    expect(buildEventIcs(event, NOW)).toContain("SUMMARY:A\\;B\\,C\\nD");
  });

  it("includes location and remarks when present", () => {
    const event = makeEvent({ location: "Live Firing Range", rawTitle: "Bring ear plugs" });
    const ics = buildEventIcs(event, NOW);
    expect(ics).toContain("LOCATION:Live Firing Range");
    expect(ics).toContain("DESCRIPTION:Bring ear plugs");
  });

  it("omits location and description when empty", () => {
    const ics = buildEventIcs(makeEvent(), NOW);
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("folds long lines at 75 octets on code-point boundaries", () => {
    const event = makeEvent({ rawTitle: "会".repeat(60) });
    const ics = buildEventIcs(event, NOW);
    const lines = ics.split("\r\n");
    const encoder = new TextEncoder();
    for (const line of lines) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(lines.some((line) => line.startsWith(" "))).toBe(true);
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`DESCRIPTION:${"会".repeat(60)}`);
  });
});

describe("icsFileName", () => {
  it("derives a safe filename from the rendered title", () => {
    const event = makeEvent({ title: 'A/B:C*D?E"F<G>H|I' });
    expect(icsFileName(event)).toBe("A B C D E F G H I.ics");
  });

  it("falls back to a neutral name for an empty title", () => {
    expect(icsFileName(makeEvent({ title: "   " }))).toBe("event.ics");
  });
});
