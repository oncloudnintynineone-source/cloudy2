import { describe, expect, it } from "vitest";

import {
  isTimeOption,
  joinDateTimeParts,
  naiveDatePart,
  naiveTimePart,
  normalizeTimeOptions,
  resolveTimeOption,
  resolveTimeOptions,
  TIME_OPTIONS,
  TIME_OPTION_LABELS,
} from "./timeOptions";

describe("isTimeOption", () => {
  it("accepts the canonical values", () => {
    expect(isTimeOption("range")).toBe(true);
    expect(isTimeOption("full")).toBe(true);
    expect(isTimeOption("half")).toBe(true);
  });

  it("rejects anything else (including the old ampm value)", () => {
    expect(isTimeOption("ampm")).toBe(false);
    expect(isTimeOption("")).toBe(false);
    expect(isTimeOption(null)).toBe(false);
    expect(isTimeOption(42)).toBe(false);
  });
});

describe("TIME_OPTIONS / TIME_OPTION_LABELS", () => {
  it("exposes all three options in display order with labels", () => {
    expect([...TIME_OPTIONS]).toEqual(["range", "full", "half"]);
    expect(TIME_OPTION_LABELS.range).toBe("Start & End");
    expect(TIME_OPTION_LABELS.full).toBe("Full Day");
    expect(TIME_OPTION_LABELS.half).toBe("Half Day");
  });
});

describe("normalizeTimeOptions", () => {
  it("keeps valid options in order", () => {
    expect(normalizeTimeOptions(["full", "range"])).toEqual(["full", "range"]);
    expect(normalizeTimeOptions(["half", "full"])).toEqual(["half", "full"]);
  });

  it("drops unknown values (legacy ampm included) and dedupes", () => {
    expect(normalizeTimeOptions(["full", "ampm", "half", "full", null])).toEqual([
      "full",
      "half",
    ]);
  });

  it("returns [] for non-arrays", () => {
    expect(normalizeTimeOptions(null)).toEqual([]);
    expect(normalizeTimeOptions("range")).toEqual([]);
  });
});

describe("resolveTimeOptions", () => {
  it("passes through a non-empty list", () => {
    expect(resolveTimeOptions(["full"])).toEqual(["full"]);
    expect(resolveTimeOptions(["half"])).toEqual(["half"]);
  });

  it("falls back to the default range behaviour when empty", () => {
    expect(resolveTimeOptions([])).toEqual(["range"]);
  });
});

describe("resolveTimeOption", () => {
  it("returns the selection when allowed", () => {
    expect(resolveTimeOption(["full", "range"], "full")).toBe("full");
    expect(resolveTimeOption(["range", "half"], "half")).toBe("half");
  });

  it("falls back to the first allowed option when not allowed", () => {
    expect(resolveTimeOption(["full"], "range")).toBe("full");
    expect(resolveTimeOption(["range"], "full")).toBe("range");
    expect(resolveTimeOption(["range"], "half")).toBe("range");
  });

  it("falls back to range when nothing is allowed", () => {
    expect(resolveTimeOption([], "full")).toBe("range");
    expect(resolveTimeOption([], "half")).toBe("range");
    expect(resolveTimeOption([], "")).toBe("range");
  });
});

describe("naiveDatePart / naiveTimePart / joinDateTimeParts", () => {
  it("splits a naive datetime into date and HH:mm time parts", () => {
    expect(naiveDatePart("2026-08-15 09:00:00")).toBe("2026-08-15");
    expect(naiveTimePart("2026-08-15 09:00:00")).toBe("09:00");
  });

  it("splits a bare date into a date and an empty time", () => {
    expect(naiveDatePart("2026-08-15")).toBe("2026-08-15");
    expect(naiveTimePart("2026-08-15")).toBe("");
  });

  it("leaves empty input untouched", () => {
    expect(naiveDatePart("")).toBe("");
    expect(naiveTimePart("")).toBe("");
  });

  it("drops the seconds part but keeps hours and minutes zero-padded", () => {
    expect(naiveTimePart("2026-08-15 00:05:59")).toBe("00:05");
  });

  it("joins a date and a time into the naive form with zero seconds", () => {
    expect(joinDateTimeParts("2026-08-15", "09:00")).toBe("2026-08-15 09:00:00");
  });

  it("joins a date with a blank time as a bare date string", () => {
    expect(joinDateTimeParts("2026-08-15", "")).toBe("2026-08-15");
  });

  it("drops the time when the date is blank (never a time-only value)", () => {
    expect(joinDateTimeParts("", "09:00")).toBe("");
    expect(joinDateTimeParts("", "")).toBe("");
  });

  it("round-trips a naive datetime through the parts", () => {
    const naive = "2026-08-15 23:45:00";
    expect(joinDateTimeParts(naiveDatePart(naive), naiveTimePart(naive))).toBe(naive);
  });
});
