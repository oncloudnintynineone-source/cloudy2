import { describe, expect, it } from "vitest";

import {
  absEventRange,
  addDays,
  addOneDay,
  dateToUtc,
  daysBetween,
  daysUntilDate,
  formatInstantToNaive,
  halfDayRange,
  lastDayOfMonth,
  monthGridMonths,
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

  it("adds a signed number of days across month and year boundaries", () => {
    expect(addDays("2026-01-30", 2)).toBe("2026-02-01");
    expect(addDays("2026-06-30", 41)).toBe("2026-08-10");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -59)).toBe("2026-01-01");
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

describe("lastDayOfMonth", () => {
  it("returns the month's last calendar day", () => {
    expect(lastDayOfMonth("2026-08")).toBe("2026-08-31");
    expect(lastDayOfMonth("2026-05")).toBe("2026-05-31");
  });

  it("handles short months and leap years", () => {
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28");
    expect(lastDayOfMonth("2028-02")).toBe("2028-02-29");
    expect(lastDayOfMonth("2026-12")).toBe("2026-12-31");
  });
});

describe("daysBetween", () => {
  it("lists every day from start to end, inclusive", () => {
    expect(daysBetween("2026-08-30", "2026-09-02")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ]);
  });

  it("returns a single entry when start equals end", () => {
    expect(daysBetween("2026-08-15", "2026-08-15")).toEqual(["2026-08-15"]);
  });

  it("returns nothing for a reversed range", () => {
    expect(daysBetween("2026-09-01", "2026-08-31")).toEqual([]);
  });
});

describe("daysUntilDate", () => {
  it("counts whole calendar days between date parts", () => {
    expect(daysUntilDate("2026-08-15 09:00:00", "2026-08-20 23:00:00")).toBe(5);
    expect(daysUntilDate("2026-08-15 23:00:00", "2026-08-16 00:00:00")).toBe(1);
    expect(daysUntilDate("2026-08-15 09:00:00", "2026-09-29 09:00:00")).toBe(45);
  });

  it("is 0 for a target later the same day", () => {
    expect(daysUntilDate("2026-08-15 09:00:00", "2026-08-15 18:00:00")).toBe(0);
  });

  it("clamps a started or past target to 0", () => {
    expect(daysUntilDate("2026-08-15 09:00:00", "2026-08-14 09:00:00")).toBe(0);
  });

  it("spans month and year boundaries", () => {
    expect(daysUntilDate("2026-08-30", "2026-09-02")).toBe(3);
    expect(daysUntilDate("2026-12-30", "2027-01-02")).toBe(3);
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

  it("keeps a date-only start on the 1st in its own month (no UTC midnight shift)", () => {
    expect(monthsInRange("2026-06-01", "2026-06-07")).toEqual(["2026-06"]);
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

describe("halfDayRange", () => {
  it("resolves an AM→PM same-day pair to a full SGT day", () => {
    expect(halfDayRange("2026-08-15", "2026-08-15", "AM", "PM")).toEqual({
      start: new Date("2026-08-14T16:00:00.000Z"),
      end: new Date("2026-08-15T16:00:00.000Z"),
    });
  });

  it("covers only the morning for a same-day AM→AM event", () => {
    // 12:00 SGT == 04:00 UTC.
    expect(halfDayRange("2026-08-15", "2026-08-15", "AM", "AM")).toEqual({
      start: new Date("2026-08-14T16:00:00.000Z"),
      end: new Date("2026-08-15T04:00:00.000Z"),
    });
  });

  it("covers only the afternoon for a same-day PM→PM event", () => {
    // 12:00 SGT == 04:00 UTC.
    expect(halfDayRange("2026-08-15", "2026-08-15", "PM", "PM")).toEqual({
      start: new Date("2026-08-15T04:00:00.000Z"),
      end: new Date("2026-08-15T16:00:00.000Z"),
    });
  });

  it("handles a cross-midnight PM→AM span", () => {
    // Start 15th 12:00 SGT (04:00 UTC), end 16th 12:00 SGT (04:00 UTC).
    expect(halfDayRange("2026-08-15", "2026-08-16", "PM", "AM")).toEqual({
      start: new Date("2026-08-15T04:00:00.000Z"),
      end: new Date("2026-08-16T04:00:00.000Z"),
    });
  });

  it("degenerates to a full SGT day with both markers absent", () => {
    expect(halfDayRange("2026-08-15", "2026-08-15", null, null)).toEqual({
      start: new Date("2026-08-14T16:00:00.000Z"),
      end: new Date("2026-08-15T16:00:00.000Z"),
    });
  });
});

describe("monthGridRows", () => {
  it("counts the unpadded weeks but pads to the fixed 6-row grid (Aug 2026)", () => {
    // Aug 2026: 1st is Saturday, 5 days after the grid's Monday;
    // ceil((5 + 31) / 7) = 6 rows — already at the Mantine padding.
    expect(monthGridRows("2026-08")).toBe(6);
  });

  it("pads a 5-week month to the fixed 6-row grid (May 2026)", () => {
    // May 2026: 1st is Friday, 4 days after the grid's Monday;
    // ceil((4 + 31) / 7) = 5, padded to 6 rows.
    expect(monthGridRows("2026-05")).toBe(6);
  });

  it("pads a 5-week month to the fixed 6-row grid (Feb 2026)", () => {
    // Feb 2026: 1st is Sunday, 6 days after the grid's Monday;
    // ceil((6 + 28) / 7) = 5, padded to 6 rows.
    expect(monthGridRows("2026-02")).toBe(6);
  });

  it("pads a 4-week month to the fixed 6-row grid (Feb 2027)", () => {
    // Feb 2027: 1st is Monday; ceil((0 + 28) / 7) = 4, padded to 6 rows.
    expect(monthGridRows("2027-02")).toBe(6);
  });
});

describe("monthGridMonths", () => {
  it("covers the months of a 6-week grid spanning three months (Aug 2026)", () => {
    // 1st is Saturday: grid runs Mon 2026-07-27 → Sun 2026-09-06.
    expect(monthGridMonths("2026-08")).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("covers a 5-week month's grid (May 2026)", () => {
    // 1st is Friday: grid runs Mon 2026-04-27 → Sun 2026-06-07.
    expect(monthGridMonths("2026-05")).toEqual(["2026-04", "2026-05", "2026-06"]);
  });

  it("covers only the two months when the 1st is a Monday (Jun 2026)", () => {
    // 1st is Monday: grid runs Mon 2026-06-01 → Sun 2026-07-12.
    expect(monthGridMonths("2026-06")).toEqual(["2026-06", "2026-07"]);
  });

  it("covers a Sunday-start month's grid (Feb 2026)", () => {
    // 1st is Sunday: grid runs Mon 2026-01-26 → Sun 2026-03-08.
    expect(monthGridMonths("2026-02")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("rolls across the year boundary (Dec 2026)", () => {
    // 1st is Tuesday: grid runs Mon 2026-11-30 → Sun 2027-01-10.
    expect(monthGridMonths("2026-12")).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});
