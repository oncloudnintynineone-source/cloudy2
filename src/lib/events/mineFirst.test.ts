import { describe, expect, it } from "vitest";

import { sortMineFirst } from "./mineFirst";
import type { CalendarEvent } from "./queries";

function makeEvent(id: string, start: string, end: string): CalendarEvent {
  return {
    id,
    title: `Event ${id}`,
    start,
    end,
    color: "blue",
    payload: {
      calendarId: "cal-1",
      googleEventId: id,
      allDay: false,
      eventType: null,
      calendarName: "Dept A",
      eventId: null,
      creatorId: null,
      inviteeUserIds: [],
      inviteeDepartmentIds: [],
      rawTitle: null,
      timeOption: "range",
      startAmPm: null,
      endAmPm: null,
      outOfCamp: false,
      overseas: false,
      pinned: false,
      ownerOnlyEdits: false,
      location: "",
      external: false,
    },
  };
}

describe("sortMineFirst", () => {
  it("puts the user's events before the rest", () => {
    const events = [
      makeEvent("o1", "2026-08-21 08:00:00", "2026-08-21 09:00:00"),
      makeEvent("m1", "2026-08-21 10:00:00", "2026-08-21 11:00:00"),
      makeEvent("o2", "2026-08-21 12:00:00", "2026-08-21 13:00:00"),
    ];
    const out = sortMineFirst(events, new Set(["m1"]));
    expect(out.map((e) => e.id)).toEqual(["m1", "o1", "o2"]);
  });

  it("sorts each block by start time, even when the input is shuffled", () => {
    const events = [
      makeEvent("m2", "2026-08-21 15:00:00", "2026-08-21 16:00:00"),
      makeEvent("o1", "2026-08-21 12:00:00", "2026-08-21 13:00:00"),
      makeEvent("m1", "2026-08-21 10:00:00", "2026-08-21 11:00:00"),
      makeEvent("o2", "2026-08-21 08:00:00", "2026-08-21 09:00:00"),
    ];
    const out = sortMineFirst(events, new Set(["m1", "m2"]));
    expect(out.map((e) => e.id)).toEqual(["m1", "m2", "o2", "o1"]);
  });

  it("breaks start ties by end, then id", () => {
    const events = [
      makeEvent("b", "2026-08-21 09:00:00", "2026-08-21 10:00:00"),
      makeEvent("a", "2026-08-21 09:00:00", "2026-08-21 12:00:00"),
    ];
    const out = sortMineFirst(events, new Set());
    expect(out.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("returns a full time sort when nothing is mine", () => {
    const events = [
      makeEvent("o2", "2026-08-21 12:00:00", "2026-08-21 13:00:00"),
      makeEvent("o1", "2026-08-21 08:00:00", "2026-08-21 09:00:00"),
    ];
    const out = sortMineFirst(events, new Set());
    expect(out.map((e) => e.id)).toEqual(["o1", "o2"]);
  });

  it("keeps every event exactly once", () => {
    const events = [
      makeEvent("m1", "2026-08-21 10:00:00", "2026-08-21 11:00:00"),
      makeEvent("o1", "2026-08-21 08:00:00", "2026-08-21 09:00:00"),
    ];
    const out = sortMineFirst(events, new Set(["m1", "missing"]));
    expect(out).toHaveLength(2);
    expect(new Set(out.map((e) => e.id))).toEqual(new Set(["m1", "o1"]));
  });

  it("does not mutate the input array", () => {
    const events = [
      makeEvent("m1", "2026-08-21 10:00:00", "2026-08-21 11:00:00"),
      makeEvent("o1", "2026-08-21 08:00:00", "2026-08-21 09:00:00"),
    ];
    const before = events.map((e) => e.id);
    sortMineFirst(events, new Set(["m1"]));
    expect(events.map((e) => e.id)).toEqual(before);
  });
});
