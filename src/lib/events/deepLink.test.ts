import { describe, expect, it } from "vitest";

import { buildEventDeepLink, findEventByGroupId } from "./deepLink";
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
