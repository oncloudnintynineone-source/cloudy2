import { describe, expect, it } from "vitest";

import type { GcalEventItem } from "@/lib/google/types";

import { encodeEventNotes } from "./notes";
import { projectRangeEvents, type CalendarRangeData } from "./queries";

function item(id: string, calendarId: string, title: string, startIso: string): GcalEventItem {
  return {
    id,
    calendarId,
    title,
    description: "",
    start: new Date(startIso),
    end: new Date(startIso),
    allDay: false,
    location: "",
  };
}

function rangeData(): CalendarRangeData {
  return {
    rows: [
      { id: "cal-a", name: "Alpha", googleCalendarId: "gcal-a", color: null },
      { id: "cal-b", name: "Bravo", googleCalendarId: "gcal-b", color: null },
    ],
    typeColors: new Map(),
    cached: {
      events: {
        "2026-09": {
          "gcal-a": [
            item("a1", "gcal-a", "A late", "2026-09-10T10:00:00Z"),
            item("a2", "gcal-a", "A early", "2026-09-10T08:00:00Z"),
          ],
          "gcal-b": [item("b1", "gcal-b", "B", "2026-09-10T09:00:00Z")],
        },
      },
      allServed: true,
    },
    months: ["2026-09"],
  } as unknown as CalendarRangeData;
}

describe("projectRangeEvents", () => {
  it("projects every calendar in the read, sorted by start", () => {
    const events = projectRangeEvents(rangeData(), { typeFilter: [], userFilter: [] });
    expect(events.map((event) => event.title)).toEqual(["A early", "B", "A late"]);
  });

  it("narrows to a calendar subset, preserving display order", () => {
    const events = projectRangeEvents(rangeData(), { typeFilter: [], userFilter: [] }, ["cal-b"]);
    expect(events.map((event) => event.title)).toEqual(["B"]);
  });

  it("drops untyped events when a type filter is set", () => {
    const events = projectRangeEvents(rangeData(), { typeFilter: ["Training"], userFilter: [] });
    expect(events).toEqual([]);
  });

  it("returns an empty list for an empty read", () => {
    const empty: CalendarRangeData = {
      rows: [],
      typeColors: new Map(),
      cached: { events: {}, allServed: true },
      months: [],
    };
    expect(projectRangeEvents(empty, { typeFilter: [], userFilter: [] })).toEqual([]);
  });

  it("keeps a department-tagged event for an active member only when memberships are given", () => {
    const description = encodeEventNotes({ inviteeDepartments: ["cal-a"] });
    const data = {
      rows: [{ id: "cal-a", name: "Alpha", googleCalendarId: "gcal-a", color: null }],
      typeColors: new Map(),
      cached: {
        events: {
          "2026-09": {
            "gcal-a": [
              { ...item("a1", "gcal-a", "Dept event", "2026-09-10T10:00:00Z"), description },
            ],
          },
        },
        allServed: true,
      },
      months: ["2026-09"],
    } as unknown as CalendarRangeData;

    expect(projectRangeEvents(data, { typeFilter: [], userFilter: ["alice"] })).toEqual([]);
    expect(
      projectRangeEvents(
        data,
        { typeFilter: [], userFilter: ["alice"] },
        undefined,
        new Map([["cal-a", ["alice"]]]),
      ).map((event) => event.title),
    ).toEqual(["Dept event"]);
  });
});
