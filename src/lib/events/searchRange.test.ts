import { describe, expect, it } from "vitest";

import {
  addMonthsClamped,
  coerceSearchRange,
  defaultSearchFrom,
  defaultSearchTo,
  searchRangeBoundaries,
} from "./searchRange";

describe("addMonthsClamped", () => {
  it("adds months across a year boundary", () => {
    expect(addMonthsClamped("2026-01-15", 2)).toBe("2026-03-15");
    expect(addMonthsClamped("2026-01-15", -2)).toBe("2025-11-15");
  });

  it("clamps the day to the target month's length", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("handles leap February", () => {
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
  });
});

describe("defaultSearchFrom / defaultSearchTo", () => {
  it("opens one month back and three months ahead", () => {
    expect(defaultSearchFrom("2026-06-15")).toBe("2026-05-15");
    expect(defaultSearchTo("2026-06-15")).toBe("2026-09-15");
  });

  it("clamps the day on short months", () => {
    expect(defaultSearchTo("2026-01-31")).toBe("2026-04-30");
  });
});

describe("searchRangeBoundaries", () => {
  it("uses UTC midnight for from and an exclusive end for to", () => {
    const { timeMin, timeMax } = searchRangeBoundaries("2026-06-01", "2026-06-03");
    expect(timeMin.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(timeMax.toISOString()).toBe("2026-06-04T00:00:00.000Z");
  });
});

describe("coerceSearchRange", () => {
  it("passes through an ascending pair", () => {
    expect(coerceSearchRange("2026-06-01", "2026-06-03")).toEqual({
      from: "2026-06-01",
      to: "2026-06-03",
    });
  });

  it("swaps a reversed pair", () => {
    expect(coerceSearchRange("2026-06-03", "2026-06-01")).toEqual({
      from: "2026-06-01",
      to: "2026-06-03",
    });
  });

  it("clamps an over-wide forward span", () => {
    const { from, to } = coerceSearchRange("2026-01-01", "2030-01-01");
    expect(from).toBe("2026-01-01");
    expect(to).toBe("2028-01-01");
  });
});
