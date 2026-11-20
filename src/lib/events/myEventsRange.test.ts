import { describe, expect, it } from "vitest";

import {
  DEFAULT_MY_EVENTS_RANGE_MONTHS,
  isMyEventsRangeMonths,
  myEventsRangeLabel,
  myEventsWindow,
  parseMyEventsRange,
} from "./myEventsRange";

describe("parseMyEventsRange", () => {
  it("accepts the selectable windows (number or string)", () => {
    expect(parseMyEventsRange(1)).toBe(1);
    expect(parseMyEventsRange("6")).toBe(6);
    expect(parseMyEventsRange(12)).toBe(12);
  });

  it("falls back to the default on anything else", () => {
    expect(parseMyEventsRange("3")).toBe(DEFAULT_MY_EVENTS_RANGE_MONTHS);
    expect(parseMyEventsRange("4")).toBe(DEFAULT_MY_EVENTS_RANGE_MONTHS);
    expect(parseMyEventsRange("0")).toBe(DEFAULT_MY_EVENTS_RANGE_MONTHS);
    expect(parseMyEventsRange("")).toBe(DEFAULT_MY_EVENTS_RANGE_MONTHS);
    expect(parseMyEventsRange("abc")).toBe(DEFAULT_MY_EVENTS_RANGE_MONTHS);
    expect(parseMyEventsRange(99)).toBe(DEFAULT_MY_EVENTS_RANGE_MONTHS);
    expect(parseMyEventsRange(undefined)).toBe(DEFAULT_MY_EVENTS_RANGE_MONTHS);
    expect(parseMyEventsRange(null)).toBe(DEFAULT_MY_EVENTS_RANGE_MONTHS);
  });

  it("defaults to ±1 month and narrows only the selectable values", () => {
    expect(DEFAULT_MY_EVENTS_RANGE_MONTHS).toBe(1);
    expect(isMyEventsRangeMonths(1)).toBe(true);
    expect(isMyEventsRangeMonths(3)).toBe(false);
  });
});

describe("myEventsRangeLabel", () => {
  it("spells out months (singular for one) and the year", () => {
    expect(myEventsRangeLabel(1)).toBe("\u00b11 month");
    expect(myEventsRangeLabel(6)).toBe("\u00b16 months");
    expect(myEventsRangeLabel(12)).toBe("\u00b11 year");
  });
});

describe("myEventsWindow", () => {
  it("spans the month N before through N after today's month", () => {
    expect(myEventsWindow("2026-08-21", 1)).toEqual({
      windowStart: "2026-07-01",
      windowEnd: "2026-09-30",
    });
    expect(myEventsWindow("2026-08-21", 6)).toEqual({
      windowStart: "2026-02-01",
      windowEnd: "2027-02-28",
    });
  });

  it("crosses the year boundary", () => {
    expect(myEventsWindow("2026-01-15", 1)).toEqual({
      windowStart: "2025-12-01",
      windowEnd: "2026-02-28",
    });
    expect(myEventsWindow("2026-12-31", 1)).toEqual({
      windowStart: "2026-11-01",
      windowEnd: "2027-01-31",
    });
  });

  it("handles a 12-month window", () => {
    expect(myEventsWindow("2026-08-01", 12)).toEqual({
      windowStart: "2025-08-01",
      windowEnd: "2027-08-31",
    });
  });
});
