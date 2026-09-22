import { describe, expect, it } from "vitest";

import {
  DEFAULT_KAH_RANGE_MONTHS,
  isKahRangeMonths,
  kahForwardWindow,
  kahRangeLabel,
  parseKahRange,
} from "./range";

describe("parseKahRange", () => {
  it("accepts every selectable look-ahead as a string or number", () => {
    expect(parseKahRange("3")).toBe(3);
    expect(parseKahRange("6")).toBe(6);
    expect(parseKahRange("12")).toBe(12);
    expect(parseKahRange(6)).toBe(6);
  });

  it("falls back to the default for unsupported/garbage values", () => {
    expect(parseKahRange("1")).toBe(DEFAULT_KAH_RANGE_MONTHS);
    expect(parseKahRange("0")).toBe(DEFAULT_KAH_RANGE_MONTHS);
    expect(parseKahRange("abc")).toBe(DEFAULT_KAH_RANGE_MONTHS);
    expect(parseKahRange(undefined)).toBe(DEFAULT_KAH_RANGE_MONTHS);
    expect(parseKahRange(null)).toBe(DEFAULT_KAH_RANGE_MONTHS);
    expect(parseKahRange(99)).toBe(DEFAULT_KAH_RANGE_MONTHS);
  });

  it("isKahRangeMonths narrows only the selectable values", () => {
    expect(isKahRangeMonths(3)).toBe(true);
    expect(isKahRangeMonths(12)).toBe(true);
    expect(isKahRangeMonths(1)).toBe(false);
  });
});

describe("kahRangeLabel", () => {
  it("labels months and the single year", () => {
    expect(kahRangeLabel(3)).toBe("3 months");
    expect(kahRangeLabel(6)).toBe("6 months");
    expect(kahRangeLabel(12)).toBe("1 year");
  });
});

describe("kahForwardWindow", () => {
  it("starts today and ends on the last day of the month N months ahead", () => {
    expect(kahForwardWindow("2026-09-22", 3)).toEqual({
      windowStart: "2026-09-22",
      windowEnd: "2026-12-31",
    });
    expect(kahForwardWindow("2026-09-22", 6)).toEqual({
      windowStart: "2026-09-22",
      windowEnd: "2027-03-31",
    });
    expect(kahForwardWindow("2026-09-22", 12)).toEqual({
      windowStart: "2026-09-22",
      windowEnd: "2027-09-30",
    });
  });

  it("clamps to the real last day of shorter months", () => {
    expect(kahForwardWindow("2026-01-31", 3).windowEnd).toBe("2026-04-30");
    expect(kahForwardWindow("2026-11-30", 3).windowEnd).toBe("2027-02-28");
  });
});
