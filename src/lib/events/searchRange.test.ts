import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "./queries";
import { eventWithinRange, filterRangeForSearch } from "./searchRange";

function event(overrides: {
  start: string;
  end: string;
  title?: string;
  location?: string;
  eventType?: string | null;
  allDay?: boolean;
}): CalendarEvent {
  const allDay = overrides.allDay ?? false;
  return {
    id: `cal:${overrides.title ?? overrides.start}`,
    title: overrides.title ?? "(no title)",
    start: overrides.start,
    end: overrides.end,
    color: "blue",
    payload: {
      calendarId: "cal",
      googleEventId: "g",
      allDay,
      eventType: overrides.eventType ?? null,
      calendarName: "Logistics",
      eventId: null,
      creatorId: null,
      inviteeUserIds: [],
      inviteeDepartmentIds: [],
      ownerOnlyEdits: false,
      rawTitle: null,
      timeOption: allDay ? "full" : "range",
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

describe("eventWithinRange", () => {
  it("includes an all-day event on the window's last day (exclusive Google end)", () => {
    const e = event({ start: "2026-09-24 00:00:00", end: "2026-09-25 00:00:00", allDay: true });
    expect(eventWithinRange(e, "2026-09-24", "2026-09-24")).toBe(true);
  });

  it("excludes an event wholly outside the window", () => {
    const e = event({ start: "2026-09-24 00:00:00", end: "2026-09-25 00:00:00", allDay: true });
    expect(eventWithinRange(e, "2026-09-20", "2026-09-21")).toBe(false);
  });

  it("includes a timed event that overlaps the window edge", () => {
    const e = event({ start: "2026-09-24 23:00:00", end: "2026-09-25 01:00:00" });
    expect(eventWithinRange(e, "2026-09-24", "2026-09-24")).toBe(true);
  });
});

describe("filterRangeForSearch", () => {
  const EVENTS = [
    event({ start: "2026-09-22 09:00:00", end: "2026-09-22 10:00:00", title: "Old briefing" }),
    event({
      start: "2026-09-24 09:00:00",
      end: "2026-09-24 10:00:00",
      title: "Safety briefing",
      location: "Sembawang",
    }),
    event({ start: "2026-09-26 09:00:00", end: "2026-09-26 10:00:00", title: "Logistics review" }),
  ];

  it("trims to the exact window and returns chronological order for a blank query", () => {
    const result = filterRangeForSearch(EVENTS, "2026-09-23", "2026-09-25", "");
    expect(result.map((e) => e.title)).toEqual(["Safety briefing"]);
  });

  it("fuzzy-matches a typo in the title", () => {
    const result = filterRangeForSearch(EVENTS, "2026-09-23", "2026-09-25", "brieffng");
    expect(result.map((e) => e.title)).toEqual(["Safety briefing"]);
  });

  it("matches the location", () => {
    const result = filterRangeForSearch(EVENTS, "2026-09-23", "2026-09-25", "sembawng");
    expect(result.map((e) => e.title)).toEqual(["Safety briefing"]);
  });

  it("returns matches in relevance order (best score first)", () => {
    const ranked = [
      event({ start: "2026-09-24 09:00:00", end: "2026-09-24 10:00:00", title: "Quarterly report" }),
      event({ start: "2026-09-24 11:00:00", end: "2026-09-24 12:00:00", title: "Report" }),
    ];
    const result = filterRangeForSearch(ranked, "2026-09-24", "2026-09-24", "report");
    expect(result.map((e) => e.title)).toEqual(["Report", "Quarterly report"]);
  });
});
