import { describe, expect, it } from "vitest";

import {
  DEFAULT_MY_EVENTS_RANGE_MONTHS,
  myEventsRangeLabel,
  myEventsWindow,
  parseMyEventsRange,
} from "./myEventsRange";

describe("parseMyEventsRange", () => {
  it("accepts the selectable windows (number or string)", () => {
    expect(parseMyEventsRange(3)).toBe(3);
    expect(parseMyEventsRange("6")).toBe(6);
    expect(parseMyEventsRange(12)).toBe(12);
  });

  it("falls back to the default on anything else", () => {
    expect(parseMyEventsRange("1")).toBe(DEFAULT_MY_EVENTS_RANGE_MONTHS);
    expect(parseMyEventsRange("0")).toBe(DEFAULT_MY_EVENTS_RANGE_MONTHS);
    expect(parseMyEventsRange("abc")).toBe(DEFAULT_MY_EVENTS_RANGE_MONTHS);
    expect(parseMyEventsRange(99)).toBe(DEFAULT_MY_EVENTS_RANGE_MONTHS);
    expect(parseMyEventsRange(undefined)).toBe(DEFAULT_MY_EVENTS_RANGE_MONTHS);
    expect(parseMyEventsRange(null)).toBe(DEFAULT_MY_EVENTS_RANGE_MONTHS);
  });
});

describe("myEventsRangeLabel", () => {
  it("spells out months and the year", () => {
    expect(myEventsRangeLabel(3)).toBe("\u00b13 months");
    expect(myEventsRangeLabel(6)).toBe("\u00b16 months");
    expect(myEventsRangeLabel(12)).toBe("\u00b11 year");
  });
});

describe("myEventsWindow", () => {
  it("spans the month N before through N after today's month", () => {
    expect(myEventsWindow("2026-08-21", 3)).toEqual({
      windowStart: "2026-05-01",
      windowEnd: "2026-11-30",
    });
  });

  it("crosses the year boundary", () => {
    expect(myEventsWindow("2026-01-15", 3)).toEqual({
      windowStart: "2025-10-01",
      windowEnd: "2026-04-30",
    });
    expect(myEventsWindow("2026-12-31", 3)).toEqual({
      windowStart: "2026-09-01",
      windowEnd: "2027-03-31",
    });
  });

  it("handles a 12-month window", () => {
    expect(myEventsWindow("2026-08-01", 12)).toEqual({
      windowStart: "2025-08-01",
      windowEnd: "2027-08-31",
    });
  });
});
