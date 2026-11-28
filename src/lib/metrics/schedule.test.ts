import { describe, expect, it } from "vitest";

import { METRICS_DEFAULT_SNAPSHOT_TIME } from "./config";
import {
  daysBetween,
  metricsSnapshotDate,
  metricsSnapshotWindowOpen,
  metricsNow,
  parseSnapshotTime,
  pendingSnapshotDays,
  shiftDate,
} from "./schedule";

/** 2026-11-25 is a Wednesday (ISO weekday 3). */
function sg(date: string, time = "00:00:00"): Date {
  // UTC+8 wall clock → instant.
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm, ss] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 8, mm, ss ?? 0));
}

const DEFAULT_MINUTES =
  Number(METRICS_DEFAULT_SNAPSHOT_TIME.slice(0, 2)) * 60 +
  Number(METRICS_DEFAULT_SNAPSHOT_TIME.slice(3, 5));

describe("metricsNow", () => {
  it("reads the UTC+8 wall clock, not the runtime zone", () => {
    // 2026-11-25T23:30 in Singapore is 15:30 UTC the same day.
    const clock = metricsNow(sg("2026-11-25", "23:30:00"));
    expect(clock.date).toBe("2026-11-25");
    expect(clock.minutes).toBe(23 * 60 + 30);
  });

  it("converts Sunday to ISO weekday 7", () => {
    // 2026-11-29 is a Sunday.
    expect(metricsNow(sg("2026-11-29")).weekday).toBe(7);
    expect(metricsNow(sg("2026-11-25")).weekday).toBe(3);
  });

  it("keeps the date on the Singapore side of midnight", () => {
    // 23:30 UTC is already 07:30 next day in Singapore.
    expect(metricsSnapshotDate(new Date(Date.UTC(2026, 10, 25, 23, 30)))).toBe("2026-11-26");
  });
});

describe("parseSnapshotTime", () => {
  it("parses a valid cutoff", () => {
    expect(parseSnapshotTime("23:55")).toBe(23 * 60 + 55);
    expect(parseSnapshotTime(" 08:00 ")).toBe(480);
  });

  it("falls back to the default on anything unusable", () => {
    expect(parseSnapshotTime("24:00")).toBe(DEFAULT_MINUTES);
    expect(parseSnapshotTime("nope")).toBe(DEFAULT_MINUTES);
    expect(parseSnapshotTime("12:99")).toBe(DEFAULT_MINUTES);
  });
});

describe("metricsSnapshotWindowOpen", () => {
  const base = { enabled: true, snapshotTime: "23:55", days: [1, 2, 3, 4, 5, 6, 7] };

  it("is closed when collection is off", () => {
    const result = metricsSnapshotWindowOpen({
      ...base,
      enabled: false,
      now: sg("2026-11-25", "23:59"),
    });
    expect(result).toEqual({ open: false, reason: "disabled" });
  });

  it("is closed before the cutoff and open at/after it", () => {
    expect(
      metricsSnapshotWindowOpen({ ...base, now: sg("2026-11-25", "23:54") }),
    ).toEqual({ open: false, reason: "before-time" });
    expect(metricsSnapshotWindowOpen({ ...base, now: sg("2026-11-25", "23:55") })).toEqual({
      open: true,
    });
  });

  it("is closed on a day outside the window", () => {
    expect(
      metricsSnapshotWindowOpen({
        ...base,
        days: [1, 2, 3, 4, 5],
        now: sg("2026-11-29", "23:59"), // Sunday
      }),
    ).toEqual({ open: false, reason: "not-a-snapshot-day" });
  });
});

describe("pendingSnapshotDays", () => {
  it("closes today when the ledger is empty", () => {
    expect(pendingSnapshotDays({ lastClosedDay: null, today: "2026-11-25" })).toEqual([
      "2026-11-25",
    ]);
  });

  it("closes nothing when today is already closed", () => {
    expect(
      pendingSnapshotDays({ lastClosedDay: "2026-11-25", today: "2026-11-25" }),
    ).toEqual([]);
  });

  it("back-fills a missed day oldest-first rather than skipping it", () => {
    expect(pendingSnapshotDays({ lastClosedDay: "2026-11-22", today: "2026-11-25" })).toEqual([
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
    ]);
  });

  it("caps a long gap so one pass cannot do a month of work", () => {
    const days = pendingSnapshotDays({
      lastClosedDay: "2026-10-01",
      today: "2026-11-25",
      maxBackfill: 3,
    });
    expect(days).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
  });

  it("survives a clock that moved backwards", () => {
    expect(
      pendingSnapshotDays({ lastClosedDay: "2026-11-27", today: "2026-11-25" }),
    ).toEqual([]);
  });

  it("closes only completed days when the pass caps at yesterday", () => {
    // The lazy pass: today is in progress, so it must not be closed.
    expect(
      pendingSnapshotDays({
        lastClosedDay: null,
        today: "2026-11-25",
        latestDay: "2026-11-24",
      }),
    ).toEqual(["2026-11-24"]);
    expect(
      pendingSnapshotDays({
        lastClosedDay: "2026-11-22",
        today: "2026-11-25",
        latestDay: "2026-11-24",
      }),
    ).toEqual(["2026-11-23", "2026-11-24"]);
    expect(
      pendingSnapshotDays({
        lastClosedDay: "2026-11-24",
        today: "2026-11-25",
        latestDay: "2026-11-24",
      }),
    ).toEqual([]);
  });
});

describe("date helpers", () => {
  it("shifts across month boundaries", () => {
    expect(shiftDate("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("counts whole days", () => {
    expect(daysBetween("2026-11-22", "2026-11-25")).toBe(3);
    expect(daysBetween("2026-11-25", "2026-11-22")).toBe(-3);
    expect(daysBetween("garbage", "2026-11-22")).toBe(0);
  });
});
