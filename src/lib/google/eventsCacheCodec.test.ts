import { describe, expect, it } from "vitest";

import {
  cacheEntryState,
  decodeCachedEvents,
  decodeCachedMonth,
  decodeCompressedPayload,
  encodeCachedEvents,
  encodeCachedMonth,
  encodeCompressedPayload,
} from "./eventsCacheCodec";
import type { GcalEventItem } from "./types";

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
  it("round-trips events with Dates and location preserved", () => {
    const items = [
      {
        id: "evt-1",
        calendarId: "c1@group.calendar.google.com",
        title: "Morning briefing",
        description: "notes",
        allDay: false,
        location: "Hall A",
        start: new Date("2026-08-01T01:00:00.000Z"),
        end: new Date("2026-08-01T02:00:00.000Z"),
        recurringEventId: null,
        originalStartTime: null,
        recurrence: null,
        status: null,
      },
    ];
    const decoded = decodeCachedEvents(encodeCachedEvents(items));
    expect(decoded).toEqual(items);
    expect(decoded[0].start).toBeInstanceOf(Date);
  });

  it("treats a missing location (pre-release rows) as an empty string", () => {
    const decoded = decodeCachedEvents([
      {
        id: "legacy",
        calendarId: "c",
        title: "t",
        description: "",
        allDay: false,
        start: "2026-08-01T00:00:00.000Z",
        end: "2026-08-02T00:00:00.000Z",
      },
    ]);
    expect(decoded).toHaveLength(1);
    expect(decoded[0].location).toBe("");
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

describe("encodeCachedMonth / decodeCachedMonth", () => {
  const CALENDAR = "dept@group.calendar.google.com";

  /** A fully-specified item so decode's null defaults compare equal. */
  function event(overrides: Partial<GcalEventItem> = {}): GcalEventItem {
    return {
      id: "evt-1",
      calendarId: CALENDAR,
      title: "Morning briefing",
      description: "notes",
      allDay: false,
      location: "Hall A",
      start: new Date("2026-08-01T01:00:00.000Z"),
      end: new Date("2026-08-01T02:00:00.000Z"),
      recurringEventId: null,
      originalStartTime: null,
      recurrence: null,
      status: null,
      ...overrides,
    };
  }

  it("round-trips a month and restores the calendarId from the row key", () => {
    const items = [event(), event({ id: "evt-2", title: "Afternoon", location: "" })];
    const payload = encodeCachedMonth(items);

    expect(payload.startsWith("br1:")).toBe(true);
    // The base64url body carries no JSON punctuation and no per-event
    // calendarId — that is the row key, so the payload must not repeat it.
    expect(payload).not.toContain('"');
    expect(payload).not.toContain("calendarId");
    expect(decodeCachedMonth(payload, CALENDAR)).toEqual(items);
  });

  it("keeps recurrence, status, originalStartTime and the parent id", () => {
    const item = event({
      id: "evt-instance",
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO", "EXDATE;TZID=Asia/Singapore:20260907T090000"],
      status: "cancelled",
      recurringEventId: "evt-parent",
      originalStartTime: new Date("2026-08-03T01:00:00.000Z"),
    });
    const decoded = decodeCachedMonth(encodeCachedMonth([item]), CALENDAR);
    expect(decoded).toEqual([item]);
  });

  it("treats an omitted location/allDay on decode like the legacy decoder did", () => {
    // A payload written by an older codec version with no location key.
    const payload = encodeCompressedPayload([
      {
        id: "legacy",
        start: "2026-08-01T00:00:00.000Z",
        end: "2026-08-02T00:00:00.000Z",
        allDay: true,
        title: "t",
        description: "",
      },
    ]);
    const decoded = decodeCachedMonth(payload, CALENDAR);
    expect(decoded).toHaveLength(1);
    expect(decoded![0].location).toBe("");
    expect(decoded![0].allDay).toBe(true);
    expect(decoded![0].calendarId).toBe(CALENDAR);
  });

  it("shrinks a realistic month well below the legacy JSON payload", () => {
    const blob = (seed: number) => {
      // Deterministic, entropy-dense pseudo-notes so the assertion does not rely
      // on repeated text compressing unrealistically well.
      let state = seed;
      let out = "";
      for (let index = 0; index < 220; index += 1) {
        state = (Math.imul(state, 48271) % 2147483647 + 2147483647) % 2147483647;
        out += "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[state % 64];
      }
      return out;
    };
    const items = Array.from({ length: 30 }, (_, index) =>
      event({
        id: `evt-${index}`,
        title: `Event number ${index}`,
        location: `Hall ${index}`,
        description: `Organizer remarks for event ${index}\nEdit: https://calendar.google.com/calendar/u/0/r/eventedit/abc${index}\n\nCreated in cloudy2\n\nCLOUDY2:v2 ${blob(index + 7)}`,
      }),
    );
    const legacyBytes = JSON.stringify(encodeCachedEvents(items)).length;
    const payloadBytes = encodeCachedMonth(items).length;
    expect(payloadBytes).toBeLessThan(legacyBytes * 0.6);
  });

  it("returns null for unknown tags, corrupt bodies and non-array payloads", () => {
    expect(decodeCachedMonth(null, CALENDAR)).toBeNull();
    expect(decodeCachedMonth("", CALENDAR)).toBeNull();
    expect(decodeCachedMonth("gz1:abcdef", CALENDAR)).toBeNull();
    expect(decodeCachedMonth("br1:not-really-brotli", CALENDAR)).toBeNull();
    expect(decodeCachedMonth(encodeCompressedPayload({ events: [] }), CALENDAR)).toBeNull();
  });

  it("drops malformed events and keeps valid ones", () => {
    const payload = encodeCompressedPayload([
      { id: "ok", start: "2026-08-01T00:00:00.000Z", end: "2026-08-02T00:00:00.000Z" },
      { id: "no-dates" },
      { id: "bad-date", start: "not-a-date", end: "2026-08-01T00:00:00.000Z" },
      null,
      "nope",
    ]);
    const decoded = decodeCachedMonth(payload, CALENDAR);
    expect(decoded).toHaveLength(1);
    expect(decoded![0].id).toBe("ok");
  });
});

describe("encodeCompressedPayload / decodeCompressedPayload", () => {
  it("round-trips arbitrary JSON values", () => {
    const value = { events: [{ id: "a" }], n: 2, flag: true, none: null };
    expect(decodeCompressedPayload(encodeCompressedPayload(value))).toEqual(value);
  });

  it("returns null for anything it did not write", () => {
    expect(decodeCompressedPayload(null)).toBeNull();
    expect(decodeCompressedPayload(undefined)).toBeNull();
    expect(decodeCompressedPayload('{"events":[]}')).toBeNull();
  });
});
