import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "@/lib/events/queries";

import {
  buildEventsByUser,
  eventCoversDay,
  involvedUserIds,
  sortParadeEvents,
  toParadeEvent,
  type ParadeEvent,
} from "./dayEvents";

function calendarEvent(overrides: {
  id?: string;
  start: string;
  end: string;
  allDay?: boolean;
  outOfCamp?: boolean;
  inviteeUserIds?: string[];
}): CalendarEvent {
  return {
    id: overrides.id ?? "cal:1",
    title: "Event",
    start: overrides.start,
    end: overrides.end,
    color: "blue",
    payload: {
      calendarId: "cal",
      googleEventId: "1",
      allDay: overrides.allDay ?? false,
      eventType: null,
      calendarName: "HQ",
      eventId: null,
      creatorId: null,
      inviteeUserIds: overrides.inviteeUserIds ?? [],
      inviteeDepartmentIds: [],
      ownerOnlyEdits: false,
      rawTitle: "Event",
      timeOption: "range",
      startAmPm: null,
      endAmPm: null,
      outOfCamp: overrides.outOfCamp ?? false,
      overseas: false,
      pinned: false,
      location: "",
      external: false,
    },
  } as CalendarEvent;
}

function paradeEvent(overrides: Partial<ParadeEvent> = {}): ParadeEvent {
  return {
    id: "e1",
    title: "Event",
    start: "2026-09-13 08:00:00",
    end: "2026-09-13 10:00:00",
    allDay: false,
    outOfCamp: true,
    eventType: null,
    location: "",
    calendarName: "HQ",
    creatorId: null,
    inviteeUserIds: [],
    ...overrides,
  };
}

describe("eventCoversDay", () => {
  it("matches a timed event only on its start day", () => {
    const event = calendarEvent({ start: "2026-09-13 08:00:00", end: "2026-09-13 10:00:00" });
    expect(eventCoversDay(event, "2026-09-13")).toBe(true);
    expect(eventCoversDay(event, "2026-09-14")).toBe(false);
  });

  it("treats an all-day end date as exclusive (last covered day = end − 1)", () => {
    const event = calendarEvent({
      start: "2026-09-13 00:00:00",
      end: "2026-09-15 00:00:00",
      allDay: true,
    });
    expect(eventCoversDay(event, "2026-09-13")).toBe(true);
    expect(eventCoversDay(event, "2026-09-14")).toBe(true);
    expect(eventCoversDay(event, "2026-09-15")).toBe(false);
  });
});

describe("toParadeEvent", () => {
  it("projects the parade-relevant payload fields", () => {
    const event = calendarEvent({
      start: "2026-09-13 08:00:00",
      end: "2026-09-13 10:00:00",
      outOfCamp: true,
      inviteeUserIds: ["u1"],
    });
    expect(toParadeEvent(event)).toMatchObject({
      id: "cal:1",
      title: "Event",
      outOfCamp: true,
      calendarName: "HQ",
      inviteeUserIds: ["u1"],
    });
  });
});

describe("involvedUserIds", () => {
  it("returns unique attendees only", () => {
    expect(involvedUserIds({ inviteeUserIds: ["u1", "u1", "u2"] })).toEqual(["u1", "u2"]);
  });
});

describe("sortParadeEvents", () => {
  it("orders out-of-camp first, then by start", () => {
    const inCamp = paradeEvent({ id: "in", outOfCamp: false, start: "2026-09-13 07:00:00" });
    const later = paradeEvent({ id: "later", outOfCamp: true, start: "2026-09-13 12:00:00" });
    const earlier = paradeEvent({ id: "earlier", outOfCamp: true, start: "2026-09-13 08:00:00" });
    expect(sortParadeEvents([inCamp, later, earlier]).map((e) => e.id)).toEqual([
      "earlier",
      "later",
      "in",
    ]);
  });
});

describe("buildEventsByUser", () => {
  it("maps only out-of-camp events to their attendees", () => {
    const out = paradeEvent({ id: "out", outOfCamp: true, inviteeUserIds: ["u1", "u2"] });
    const inCamp = paradeEvent({ id: "in", outOfCamp: false, inviteeUserIds: ["u1"] });
    const map = buildEventsByUser([out, inCamp]);
    expect(map.get("u1")?.map((e) => e.id)).toEqual(["out"]);
    expect(map.get("u2")?.map((e) => e.id)).toEqual(["out"]);
    expect(map.has("u3")).toBe(false);
  });

  it("sorts each user's events out-of-camp first then by start", () => {
    const a = paradeEvent({ id: "a", start: "2026-09-13 12:00:00", inviteeUserIds: ["u1"] });
    const b = paradeEvent({ id: "b", start: "2026-09-13 08:00:00", inviteeUserIds: ["u1"] });
    const map = buildEventsByUser([a, b]);
    expect(map.get("u1")?.map((e) => e.id)).toEqual(["b", "a"]);
  });
});
