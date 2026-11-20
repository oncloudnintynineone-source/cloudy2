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
    expect(parseKahRange("1")).toBe(1);
    expect(parseKahRange("6")).toBe(6);
    expect(parseKahRange("12")).toBe(12);
    expect(parseKahRange(6)).toBe(6);
  });

  it("falls back to the default for unsupported/garbage values", () => {
    expect(parseKahRange("2")).toBe(DEFAULT_KAH_RANGE_MONTHS);
    expect(parseKahRange("4")).toBe(DEFAULT_KAH_RANGE_MONTHS);
    expect(parseKahRange("0")).toBe(DEFAULT_KAH_RANGE_MONTHS);
    expect(parseKahRange("")).toBe(DEFAULT_KAH_RANGE_MONTHS);
    expect(parseKahRange("abc")).toBe(DEFAULT_KAH_RANGE_MONTHS);
    expect(parseKahRange(undefined)).toBe(DEFAULT_KAH_RANGE_MONTHS);
    expect(parseKahRange(null)).toBe(DEFAULT_KAH_RANGE_MONTHS);
    expect(parseKahRange(99)).toBe(DEFAULT_KAH_RANGE_MONTHS);
  });

  it("isKahRangeMonths narrows only the selectable values", () => {
    expect(isKahRangeMonths(1)).toBe(true);
    expect(isKahRangeMonths(12)).toBe(true);
    expect(isKahRangeMonths(3)).toBe(false);
  });
});

describe("kahRangeLabel", () => {
  it("spells out months (singular for one) and the single year", () => {
    expect(kahRangeLabel(1)).toBe("1 month");
    expect(kahRangeLabel(6)).toBe("6 months");
    expect(kahRangeLabel(12)).toBe("1 year");
  });
});

describe("kahForwardWindow", () => {
  it("starts today and ends on the last day of the month N months ahead", () => {
    expect(kahForwardWindow("2026-09-22", 1)).toEqual({
      windowStart: "2026-09-22",
      windowEnd: "2026-10-31",
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
    expect(kahForwardWindow("2026-01-31", 1).windowEnd).toBe("2026-02-28");
    expect(kahForwardWindow("2026-08-15", 6).windowEnd).toBe("2027-02-28");
  });
});
