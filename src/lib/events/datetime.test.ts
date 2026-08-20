import { describe, expect, it } from "vitest";

import {
  absEventRange,
  addOneDay,
  dateToUtc,
  formatInstantToNaive,
  monthGridRows,
  monthRange,
  monthsInRange,
  parseNaiveToInstant,
  shiftMonth,
  subOneDay,
  utcToDateString,
  weekDays,
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

describe("weekDays", () => {
  it("returns the Monday-first seven days for a mid-week date", () => {
    // 2026-08-19 is a Wednesday; its week starts Monday 2026-08-17.
    expect(weekDays("2026-08-19")).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ]);
  });

  it("keeps the same week for a Monday and its following Sunday", () => {
    expect(weekDays("2026-08-17")).toEqual(weekDays("2026-08-23"));
  });

  it("handles a Sunday belonging to the next week", () => {
    expect(weekDays("2026-08-30")).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
  });

  it("spans across a year boundary", () => {
    expect(weekDays("2026-01-04")).toEqual([
      "2025-12-29",
      "2025-12-30",
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
    ]);
  });

  it("spans across a month boundary", () => {
    expect(weekDays("2026-07-01")).toEqual([
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
    ]);
  });

  it("feeds a month-or-two month list to monthsInRange for a week range", () => {
    // A week fully inside one month
    expect(monthsInRange(weekDays("2026-08-19")[0], weekDays("2026-08-19")[6])).toEqual([
      "2026-08",
    ]);
    // A week crossing the June/July boundary
    expect(monthsInRange(weekDays("2026-07-01")[0], weekDays("2026-07-01")[6])).toEqual([
      "2026-06",
      "2026-07",
    ]);
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

describe("monthGridRows", () => {
  it("counts rows for a Saturday-start 31-day month (Aug 2026)", () => {
    // Aug 2026: 1st is Saturday (day 6); ceil((6 + 31) / 7) = 6 rows.
    expect(monthGridRows("2026-08")).toBe(6);
  });

  it("counts rows for a Friday-start 31-day month (May 2026)", () => {
    // May 2026: 1st is Friday (day 5); ceil((5 + 31) / 7) = 6 rows.
    expect(monthGridRows("2026-05")).toBe(6);
  });

  it("counts rows for a Sunday-start 28-day month (Feb 2026)", () => {
    // Feb 2026: 1st is Sunday (day 0); ceil((0 + 28) / 7) = 4 rows.
    expect(monthGridRows("2026-02")).toBe(4);
  });
});
