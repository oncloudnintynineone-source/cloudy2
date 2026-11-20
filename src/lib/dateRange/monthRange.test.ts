import { describe, expect, it } from "vitest";

import {
  forwardWindow,
  isRangeMonths,
  parseRangeMonths,
  rangeMonthsLabel,
  RANGE_MONTHS,
  symmetricWindow,
} from "./monthRange";

describe("RANGE_MONTHS", () => {
  it("is the app-wide 1 / 6 / 12-month vocabulary", () => {
    expect(RANGE_MONTHS).toEqual([1, 6, 12]);
  });
});

describe("isRangeMonths", () => {
  it("narrows only the selectable values", () => {
    expect(isRangeMonths(1)).toBe(true);
    expect(isRangeMonths(12)).toBe(true);
    expect(isRangeMonths(3)).toBe(false);
    expect(isRangeMonths("6")).toBe(false);
    expect(isRangeMonths(undefined)).toBe(false);
  });
});

describe("parseRangeMonths", () => {
  it("accepts a numeric string or number", () => {
    expect(parseRangeMonths("1", 6)).toBe(1);
    expect(parseRangeMonths(" 6 ", 1)).toBe(6);
    expect(parseRangeMonths(12, 1)).toBe(12);
  });

  it("returns the caller's fallback for anything else", () => {
    expect(parseRangeMonths("3", 1)).toBe(1);
    expect(parseRangeMonths("2", 6)).toBe(6);
    expect(parseRangeMonths("", 12)).toBe(12);
    expect(parseRangeMonths("abc", 1)).toBe(1);
    expect(parseRangeMonths(null, 6)).toBe(6);
    expect(parseRangeMonths(undefined, 12)).toBe(12);
  });
});

describe("rangeMonthsLabel", () => {
  it("words a forward window, singular for one month", () => {
    expect(rangeMonthsLabel(1, "forward")).toBe("1 month");
    expect(rangeMonthsLabel(6, "forward")).toBe("6 months");
    expect(rangeMonthsLabel(12, "forward")).toBe("1 year");
  });

  it("words a symmetric window with the ± prefix", () => {
    expect(rangeMonthsLabel(1, "symmetric")).toBe("\u00b11 month");
    expect(rangeMonthsLabel(6, "symmetric")).toBe("\u00b16 months");
    expect(rangeMonthsLabel(12, "symmetric")).toBe("\u00b11 year");
  });
});

describe("forwardWindow", () => {
  it("starts today and ends on the last civil day of the month ahead", () => {
    expect(forwardWindow("2026-09-22", 1)).toEqual({
      windowStart: "2026-09-22",
      windowEnd: "2026-10-31",
    });
    expect(forwardWindow("2026-09-22", 12)).toEqual({
      windowStart: "2026-09-22",
      windowEnd: "2027-09-30",
    });
  });

  it("clamps to the real last day, including leap February", () => {
    expect(forwardWindow("2026-01-31", 1).windowEnd).toBe("2026-02-28");
    expect(forwardWindow("2028-01-15", 1).windowEnd).toBe("2028-02-29");
  });
});

describe("symmetricWindow", () => {
  it("spans whole months either side of today's month", () => {
    expect(symmetricWindow("2026-08-21", 1)).toEqual({
      windowStart: "2026-07-01",
      windowEnd: "2026-09-30",
    });
    expect(symmetricWindow("2026-08-21", 12)).toEqual({
      windowStart: "2025-08-01",
      windowEnd: "2027-08-31",
    });
  });

  it("crosses the year boundary in both directions", () => {
    expect(symmetricWindow("2026-01-05", 1)).toEqual({
      windowStart: "2025-12-01",
      windowEnd: "2026-02-28",
    });
    expect(symmetricWindow("2026-12-31", 1)).toEqual({
      windowStart: "2026-11-01",
      windowEnd: "2027-01-31",
    });
  });
});
