import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "@/lib/events/queries";

import { eventInFeedWindow, widgetFeedWindow } from "./feedWindow";

// 2026-11-16 03:04:05Z == 2026-11-16 11:04:05 in the app's UTC+8 clock.
const NOW = new Date("2026-11-16T03:04:05Z");
const WINDOW = widgetFeedWindow(NOW);

function makeEvent(start: string, end: string, allDay = false): CalendarEvent {
  return {
    id: `copy-${start}`,
    title: "Event",
    start,
    end,
    color: "blue",
    payload: {
      calendarId: "cal-1",
      googleEventId: "g-1",
      allDay,
      eventType: null,
      calendarName: "Ops",
      eventId: "evt-1",
      creatorId: null,
      inviteeUserIds: [],
      inviteeDepartmentIds: [],
      ownerOnlyEdits: false,
      registrationEnabled: false,
      registrationCap: null,
      rawTitle: "Event",
      timeOption: allDay ? "full" : "range",
      startAmPm: null,
      endAmPm: null,
      outOfCamp: false,
      overseas: false,
      pinned: false,
      location: "",
      external: false,
    },
  };
}

describe("widgetFeedWindow", () => {
  it("covers the current month ±3 and reads one extra prior month", () => {
    expect(WINDOW.startDate).toBe("2026-08-01");
    expect(WINDOW.endDate).toBe("2027-02-28");
    expect(WINDOW.readMonths).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });
});

describe("eventInFeedWindow", () => {
  it("includes events on and inside the window edges", () => {
    expect(
      eventInFeedWindow(makeEvent("2026-08-01 00:00:00", "2026-08-01 01:00:00"), WINDOW),
    ).toBe(true);
    expect(
      eventInFeedWindow(makeEvent("2027-02-28 00:00:00", "2027-02-28 01:00:00"), WINDOW),
    ).toBe(true);
  });

  it("excludes events wholly outside the window", () => {
    expect(
      eventInFeedWindow(makeEvent("2026-07-31 00:00:00", "2026-07-31 01:00:00"), WINDOW),
    ).toBe(false);
    expect(
      eventInFeedWindow(makeEvent("2027-03-01 00:00:00", "2027-03-01 01:00:00"), WINDOW),
    ).toBe(false);
  });

  it("includes an ongoing event that started before the window", () => {
    expect(
      eventInFeedWindow(makeEvent("2026-07-30 00:00:00", "2026-08-02 00:00:00"), WINDOW),
    ).toBe(true);
  });

  it("honours the exclusive all-day end", () => {
    // Ends on 2026-07-31 (exclusive end 2026-08-01) — outside before the window.
    expect(
      eventInFeedWindow(
        makeEvent("2026-07-31 00:00:00", "2026-08-01 00:00:00", true),
        WINDOW,
      ),
    ).toBe(false);
    // Starts on 2026-08-01 — inside.
    expect(
      eventInFeedWindow(
        makeEvent("2026-08-01 00:00:00", "2026-08-02 00:00:00", true),
        WINDOW,
      ),
    ).toBe(true);
  });
});
