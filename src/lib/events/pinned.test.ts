import { describe, expect, it } from "vitest";

import { selectUpcomingPinnedEvents } from "./pinnedSelect";
import type { CalendarEvent } from "./queries";

function event(start: string, end: string, pinned: boolean, allDay = false): CalendarEvent {
  return {
    id: `cal:${start}`,
    title: "Title",
    start,
    end,
    color: "blue",
    payload: {
      calendarId: "cal",
      googleEventId: "g",
      allDay,
      eventType: null,
      calendarName: "A Dept",
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
      pinned,
      location: "",
      external: false,
    },
  };
}

describe("selectUpcomingPinnedEvents", () => {
  it("only keeps events explicitly marked as pinned", () => {
    const result = selectUpcomingPinnedEvents(
      [
        event("2026-09-01 09:00:00", "2026-09-01 10:00:00", true),
        event("2026-09-02 09:00:00", "2026-09-02 10:00:00", false),
        event("2026-09-03 09:00:00", "2026-09-03 10:00:00", true),
      ],
      "2026-09-01 08:00:00",
    );
    expect(result.map((e) => e.start)).toEqual([
      "2026-09-01 09:00:00",
      "2026-09-03 09:00:00",
    ]);
  });

  it("drops unpinned events even when they tag a whole department", () => {
    const departmentTagged = {
      ...event("2026-09-01 09:00:00", "2026-09-01 10:00:00", false),
      payload: {
        ...event("2026-09-01 09:00:00", "2026-09-01 10:00:00", false).payload,
        inviteeDepartmentIds: ["dept-a"],
      },
    };
    const result = selectUpcomingPinnedEvents([departmentTagged], "2026-09-01 08:00:00");
    expect(result).toEqual([]);
  });

  it("keeps pinned events without any tagged departments", () => {
    const result = selectUpcomingPinnedEvents(
      [event("2026-09-01 09:00:00", "2026-09-01 10:00:00", true)],
      "2026-09-01 08:00:00",
    );
    expect(result.map((e) => e.start)).toEqual(["2026-09-01 09:00:00"]);
  });

  it("drops events whose end time has already passed", () => {
    const result = selectUpcomingPinnedEvents(
      [
        event("2026-08-30 09:00:00", "2026-08-30 17:00:00", true),
        event("2026-08-31 09:00:00", "2026-09-01 08:00:00", true),
        event("2026-09-01 00:00:00", "2026-09-01 23:59:00", true),
      ],
      "2026-09-01 09:00:00",
    );
    expect(result.map((e) => e.start)).toEqual(["2026-09-01 00:00:00"]);
  });

  it("keeps a timed event that has not ended yet today", () => {
    const result = selectUpcomingPinnedEvents(
      [event("2026-09-01 09:00:00", "2026-09-01 18:00:00", true)],
      "2026-09-01 12:00:00",
    );
    expect(result.map((e) => e.start)).toEqual(["2026-09-01 09:00:00"]);
  });

  it("drops a timed event that already ended earlier today", () => {
    const result = selectUpcomingPinnedEvents(
      [event("2026-09-01 09:00:00", "2026-09-01 10:00:00", true)],
      "2026-09-01 15:00:00",
    );
    expect(result).toEqual([]);
  });

  it("keeps an all-day event whose last day is today", () => {
    const result = selectUpcomingPinnedEvents(
      [event("2026-09-01 00:00:00", "2026-09-02 00:00:00", true, true)],
      "2026-09-01 12:00:00",
    );
    expect(result.map((e) => e.start)).toEqual(["2026-09-01 00:00:00"]);
  });

  it("drops an all-day event that ended the day before (exclusive end date)", () => {
    const result = selectUpcomingPinnedEvents(
      [event("2026-08-31 00:00:00", "2026-09-01 00:00:00", true, true)],
      "2026-09-01 12:00:00",
    );
    expect(result).toEqual([]);
  });

  it("sorts by start time ascending", () => {
    const result = selectUpcomingPinnedEvents(
      [
        event("2026-09-05 09:00:00", "2026-09-05 10:00:00", true),
        event("2026-09-02 09:00:00", "2026-09-02 10:00:00", true),
        event("2026-09-01 09:00:00", "2026-09-01 10:00:00", true),
      ],
      "2026-09-01 08:00:00",
    );
    expect(result.map((e) => e.start)).toEqual([
      "2026-09-01 09:00:00",
      "2026-09-02 09:00:00",
      "2026-09-05 09:00:00",
    ]);
  });

  it("returns an empty list when nothing qualifies", () => {
    expect(
      selectUpcomingPinnedEvents(
        [event("2026-09-01 09:00:00", "2026-09-01 10:00:00", false)],
        "2026-09-01 08:00:00",
      ),
    ).toEqual([]);
  });
});
