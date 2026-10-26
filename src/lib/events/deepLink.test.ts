import { describe, expect, it } from "vitest";

import {
  buildEventDeepLink,
  buildEventShareLink,
  deepLinkMonths,
  findEventByGroupId,
  parseEventShareParams,
} from "./deepLink";
import { formatInstantToNaive } from "./datetime";
import type { CalendarEvent } from "./queries";

function event(eventId: string | null): CalendarEvent {
  return {
    id: `cal-1:${eventId ?? "external"}`,
    title: "Event",
    start: "2026-09-15 09:00:00",
    end: "2026-09-15 10:00:00",
    color: "blue",
    payload: { eventId },
  } as unknown as CalendarEvent;
}

describe("buildEventDeepLink", () => {
  it("preserves the active view and carries the event id + calendar hint", () => {
    expect(
      buildEventDeepLink({
        view: "tab-1",
        start: "2026-09-15T09:00:00+08:00",
        eventId: "g-1",
        calendarId: "cal-1",
      }),
    ).toBe("/dashboard?view=tab-1&date=2026-09-15&event=g-1&_eventCal=cal-1");
  });

  it("omits the view param when no tab is active", () => {
    expect(
      buildEventDeepLink({
        view: null,
        start: "2026-09-15",
        eventId: "g-1",
        calendarId: "cal-1",
      }),
    ).toBe("/dashboard?date=2026-09-15&event=g-1&_eventCal=cal-1");
  });

  it("omits the event params for an external event (no details link)", () => {
    expect(
      buildEventDeepLink({
        view: "tab-1",
        start: "2026-09-15",
        eventId: null,
        calendarId: "cal-1",
      }),
    ).toBe("/dashboard?view=tab-1&date=2026-09-15");
  });
});

describe("findEventByGroupId", () => {
  it("returns the copy matching the group id", () => {
    const events = [event("g-1"), event("g-2")];
    expect(findEventByGroupId(events, "g-2")).toBe(events[1]);
  });

  it("returns null for a missing or empty id", () => {
    expect(findEventByGroupId([event("g-1")], "nope")).toBeNull();
    expect(findEventByGroupId([event("g-1")], null)).toBeNull();
    expect(findEventByGroupId([event("g-1")], undefined)).toBeNull();
  });
});

describe("deepLinkMonths", () => {
  it("reads the target's own month plus the previous UTC month", () => {
    expect(deepLinkMonths("2026-11-05")).toEqual(["2026-10", "2026-11"]);
  });

  it("wraps across year boundaries", () => {
    expect(deepLinkMonths("2026-01-02")).toEqual(["2025-12", "2026-01"]);
  });

  it("ignores a non-date value and falls back to the current month window", () => {
    const months = deepLinkMonths("not-a-date");
    expect(months).toHaveLength(2);
    expect(months).toContain(formatInstantToNaive(new Date()).slice(0, 7));
  });
});

const UUID_E = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const UUID_C = "9c5f6a7b-1d2e-4f3a-8b9c-0d1e2f3a4b5c";

describe("buildEventShareLink", () => {
  it("encodes the group id, calendar id and start date", () => {
    expect(
      buildEventShareLink({
        origin: "https://app.example.com",
        eventId: UUID_E,
        calendarId: UUID_C,
        start: "2026-09-15 09:00:00",
      }),
    ).toBe(`https://app.example.com/share/event?e=${UUID_E}&c=${UUID_C}&d=2026-09-15`);
  });
});

describe("parseEventShareParams", () => {
  it("accepts a well-formed link", () => {
    expect(parseEventShareParams({ e: UUID_E, c: UUID_C, d: "2026-09-15" })).toEqual({
      eventId: UUID_E,
      calendarId: UUID_C,
      date: "2026-09-15",
    });
  });

  it("rejects non-UUID ids, a bad date and missing params", () => {
    expect(parseEventShareParams({ e: "nope", c: UUID_C, d: "2026-09-15" })).toBeNull();
    expect(parseEventShareParams({ e: UUID_E, c: "nope", d: "2026-09-15" })).toBeNull();
    expect(parseEventShareParams({ e: UUID_E, c: UUID_C, d: "15-09-2026" })).toBeNull();
    expect(parseEventShareParams({ e: UUID_E, c: UUID_C, d: undefined })).toBeNull();
    expect(parseEventShareParams({ e: undefined, c: UUID_C, d: "2026-09-15" })).toBeNull();
  });
});
