import { describe, expect, it } from "vitest";

import {
  cacheEntryState,
  decodeCachedEvents,
  encodeCachedEvents,
} from "./eventsCacheCodec";

describe("cacheEntryState", () => {
  const now = new Date("2026-08-01T00:00:00.000Z");

  it("returns fresh for recent entries", () => {
    expect(cacheEntryState(new Date("2026-08-01T00:00:29.000Z"), now, 30_000, 1_800_000)).toBe(
      "fresh",
    );
  });

  it("marks entries past the fresh window stale", () => {
    expect(cacheEntryState(new Date("2026-07-31T23:59:30.000Z"), now, 30_000, 1_800_000)).toBe(
      "stale",
    );
  });

  it("expires entries past the expire window", () => {
    expect(cacheEntryState(new Date("2026-07-31T23:30:00.000Z"), now, 30_000, 1_800_000)).toBe(
      "expired",
    );
  });

  it("handles a future fetchedAt as fresh", () => {
    expect(cacheEntryState(new Date("2026-08-01T00:01:00.000Z"), now, 30_000, 1_800_000)).toBe(
      "fresh",
    );
  });
});

describe("encodeCachedEvents / decodeCachedEvents", () => {
  it("round-trips events with Dates preserved", () => {
    const items = [
      {
        id: "evt-1",
        calendarId: "c1@group.calendar.google.com",
        title: "Morning briefing",
        description: "notes",
        allDay: false,
        start: new Date("2026-08-01T01:00:00.000Z"),
        end: new Date("2026-08-01T02:00:00.000Z"),
      },
    ];
    const decoded = decodeCachedEvents(encodeCachedEvents(items));
    expect(decoded).toEqual(items);
    expect(decoded[0].start).toBeInstanceOf(Date);
  });

  it("drops non-array payloads", () => {
    expect(decodeCachedEvents(null)).toEqual([]);
    expect(decodeCachedEvents({ foo: 1 })).toEqual([]);
  });

  it("drops malformed entries and keeps valid ones", () => {
    const raw = [
      {
        id: "ok",
        calendarId: "c",
        title: "t",
        description: "",
        allDay: true,
        start: "2026-08-01T00:00:00.000Z",
        end: "2026-08-02T00:00:00.000Z",
      },
      { id: "missing-fields" },
      {
        id: "bad-date",
        calendarId: "c",
        title: "t",
        description: "",
        allDay: false,
        start: "not-a-date",
        end: "2026-08-01T00:00:00.000Z",
      },
    ];
    const decoded = decodeCachedEvents(raw);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].id).toBe("ok");
  });
});
