import { describe, expect, it } from "vitest";

import { eventsOnDay } from "./agenda";
import type { CalendarEvent } from "./queries";

function makeEvent(id: string, start: string, end: string, allDay = false): CalendarEvent {
  return {
    id,
    title: "Event",
    start,
    end,
    color: "blue",
    payload: {
      calendarId: "cal-1",
      googleEventId: id,
      allDay,
      eventType: null,
      calendarName: "Dept A",
      eventId: null,
      creatorId: null,
      inviteeUserIds: [],
      inviteeDepartmentIds: [],
      rawTitle: null,
      timeOption: allDay ? "full" : "range",
      startAmPm: null,
      endAmPm: null,
      outOfCamp: false,
      location: "",
      external: false,
    },
  };
}

describe("eventsOnDay", () => {
  const D = "2026-08-21";

  it("keeps a timed event on the day", () => {
    const events = [makeEvent("e1", "2026-08-21 09:00:00", "2026-08-21 17:00:00")];
    expect(eventsOnDay(events, D).map((e) => e.id)).toEqual(["e1"]);
  });

  it("drops a timed event on the previous day", () => {
    const events = [makeEvent("e1", "2026-08-20 09:00:00", "2026-08-20 17:00:00")];
    expect(eventsOnDay(events, D)).toEqual([]);
  });

  it("drops a timed event on the next day", () => {
    const events = [makeEvent("e1", "2026-08-22 09:00:00", "2026-08-22 17:00:00")];
    expect(eventsOnDay(events, D)).toEqual([]);
  });

  it("drops a previous-day event that ends exactly at the day's midnight", () => {
    const events = [makeEvent("e1", "2026-08-20 22:00:00", "2026-08-21 00:00:00")];
    expect(eventsOnDay(events, D)).toEqual([]);
  });

  it("keeps a previous-day event that crosses the day's midnight", () => {
    const events = [makeEvent("e1", "2026-08-20 22:00:00", "2026-08-21 01:00:00")];
    expect(eventsOnDay(events, D).map((e) => e.id)).toEqual(["e1"]);
  });

  it("keeps an all-day event on the day (exclusive end date)", () => {
    const events = [makeEvent("e1", "2026-08-21 00:00:00", "2026-08-22 00:00:00", true)];
    expect(eventsOnDay(events, D).map((e) => e.id)).toEqual(["e1"]);
  });

  it("drops an all-day event on the previous day (the AgendaView leak)", () => {
    const events = [makeEvent("e1", "2026-08-20 00:00:00", "2026-08-21 00:00:00", true)];
    expect(eventsOnDay(events, D)).toEqual([]);
  });

  it("drops an all-day event on the next day", () => {
    const events = [makeEvent("e1", "2026-08-22 00:00:00", "2026-08-23 00:00:00", true)];
    expect(eventsOnDay(events, D)).toEqual([]);
  });

  it("keeps a multi-day event spanning the day", () => {
    const events = [makeEvent("e1", "2026-08-19 00:00:00", "2026-08-23 00:00:00", true)];
    expect(eventsOnDay(events, D).map((e) => e.id)).toEqual(["e1"]);
  });

  it("drops a multi-day event that ended the day before", () => {
    const events = [makeEvent("e1", "2026-08-18 00:00:00", "2026-08-21 00:00:00", true)];
    expect(eventsOnDay(events, D)).toEqual([]);
  });

  it("keeps an event starting exactly at the day's midnight", () => {
    const events = [makeEvent("e1", "2026-08-21 00:00:00", "2026-08-21 08:00:00")];
    expect(eventsOnDay(events, D).map((e) => e.id)).toEqual(["e1"]);
  });

  it("mixes: only the occupying events survive", () => {
    const events = [
      makeEvent("day-before-alm", "2026-08-20 00:00:00", "2026-08-21 00:00:00", true),
      makeEvent("day-timed", "2026-08-21 09:00:00", "2026-08-21 17:00:00"),
      makeEvent("day-alm", "2026-08-21 00:00:00", "2026-08-22 00:00:00", true),
      makeEvent("spanning", "2026-08-19 00:00:00", "2026-08-23 00:00:00", true),
      makeEvent("day-after-alm", "2026-08-22 00:00:00", "2026-08-23 00:00:00", true),
    ];
    expect(eventsOnDay(events, D).map((e) => e.id)).toEqual([
      "day-timed",
      "day-alm",
      "spanning",
    ]);
  });
});
