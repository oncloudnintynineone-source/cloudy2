import { describe, expect, it } from "vitest";

import {
  absEventRange,
  addOneDay,
  dateToUtc,
  formatInstantToNaive,
  monthRange,
  monthsInRange,
  parseNaiveToInstant,
  shiftMonth,
  subOneDay,
  utcToDateString,
} from "./datetime";

describe("parseNaiveToInstant / formatInstantToNaive", () => {
  it("converts between naive UTC+8 wall-clock and UTC instants", () => {
    // 09:00 SGT == 01:00 UTC
    expect(parseNaiveToInstant("2026-08-15 09:00:00").toISOString()).toBe(
      "2026-08-15T01:00:00.000Z",
    );
    expect(formatInstantToNaive(new Date("2026-08-15T01:00:00Z"))).toBe("2026-08-15 09:00:00");
  });

  it("rolls across midnight correctly", () => {
    expect(parseNaiveToInstant("2026-08-15 02:00:00").toISOString()).toBe(
      "2026-08-14T18:00:00.000Z",
    );
  });

  it("round-trips a naive value", () => {
    const instant = parseNaiveToInstant("2026-08-15 23:59:59");
    expect(formatInstantToNaive(instant)).toBe("2026-08-15 23:59:59");
  });
});

describe("all-day date helpers", () => {
  it("converts date strings to/from UTC-midnight Dates", () => {
    expect(utcToDateString(dateToUtc("2026-08-15"))).toBe("2026-08-15");
    expect(dateToUtc("2026-08-15").toISOString()).toBe("2026-08-15T00:00:00.000Z");
  });

  it("adds and subtracts one day", () => {
    expect(addOneDay("2026-08-31")).toBe("2026-09-01");
    expect(subOneDay("2026-08-01")).toBe("2026-07-31");
  });
});

describe("monthRange", () => {
  it("returns the first instant of the month and the exclusive next-month instant", () => {
    expect(monthRange("2026-08")).toEqual({
      start: new Date("2026-08-01T00:00:00.000Z"),
      end: new Date("2026-09-01T00:00:00.000Z"),
    });
  });
});

describe("shiftMonth", () => {
  it("shifts forward and backward across year boundaries", () => {
    expect(shiftMonth("2026-08", 1)).toBe("2026-09");
    expect(shiftMonth("2026-08", -1)).toBe("2026-07");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("monthsInRange", () => {
  it("returns the single month for a same-month range", () => {
    expect(monthsInRange("2026-08-15 09:00:00", "2026-08-15 10:30:00")).toEqual(["2026-08"]);
  });

  it("includes every month the range spans", () => {
    expect(monthsInRange("2026-08-25 09:00:00", "2026-10-03 18:00:00")).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });

  it("spans across a year boundary", () => {
    expect(monthsInRange("2026-12-28 08:00:00", "2027-01-02 09:00:00")).toEqual([
      "2026-12",
      "2027-01",
    ]);
  });

  it("still returns the start month for a malformed (reversed) range", () => {
    expect(monthsInRange("2026-09-10 10:00:00", "2026-08-01 09:00:00")).toEqual(["2026-09"]);
  });
});

describe("absEventRange", () => {
  it("parses timed events as UTC+8 instants", () => {
    expect(absEventRange("2026-08-17 09:00:00", "2026-08-17 10:30:00", false)).toEqual({
      start: new Date("2026-08-17T01:00:00.000Z"),
      end: new Date("2026-08-17T02:30:00.000Z"),
    });
  });

  it("uses Google date semantics for all-day events (exclusive end date)", () => {
    expect(absEventRange("2026-08-17 00:00:00", "2026-08-18 00:00:00", true)).toEqual({
      start: new Date("2026-08-17T00:00:00.000Z"),
      end: new Date("2026-08-19T00:00:00.000Z"),
    });
  });
});
