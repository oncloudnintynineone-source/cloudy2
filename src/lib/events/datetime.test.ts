import { describe, expect, it } from "vitest";

import {
  addOneDay,
  dateToUtc,
  formatInstantToNaive,
  monthRange,
  parseNaiveToInstant,
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
