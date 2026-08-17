import { describe, expect, it } from "vitest";

import {
  amPmSuffix,
  isTimeOption,
  normalizeTimeOptions,
  resolveTimeOption,
  resolveTimeOptions,
} from "./timeOptions";

describe("isTimeOption", () => {
  it("accepts the canonical values", () => {
    expect(isTimeOption("range")).toBe(true);
    expect(isTimeOption("full")).toBe(true);
  });

  it("rejects anything else (including the old ampm value)", () => {
    expect(isTimeOption("ampm")).toBe(false);
    expect(isTimeOption("half")).toBe(false);
    expect(isTimeOption("")).toBe(false);
    expect(isTimeOption(null)).toBe(false);
    expect(isTimeOption(42)).toBe(false);
  });
});

describe("normalizeTimeOptions", () => {
  it("keeps valid options in order", () => {
    expect(normalizeTimeOptions(["full", "range"])).toEqual(["full", "range"]);
  });

  it("drops unknown values (legacy ampm included) and dedupes", () => {
    expect(normalizeTimeOptions(["full", "ampm", "half", "full", null])).toEqual(["full"]);
  });

  it("returns [] for non-arrays", () => {
    expect(normalizeTimeOptions(null)).toEqual([]);
    expect(normalizeTimeOptions("range")).toEqual([]);
  });
});

describe("resolveTimeOptions", () => {
  it("passes through a non-empty list", () => {
    expect(resolveTimeOptions(["full"])).toEqual(["full"]);
  });

  it("falls back to the default range behaviour when empty", () => {
    expect(resolveTimeOptions([])).toEqual(["range"]);
  });
});

describe("resolveTimeOption", () => {
  it("returns the selection when allowed", () => {
    expect(resolveTimeOption(["full", "range"], "full")).toBe("full");
  });

  it("falls back to the first allowed option when not allowed", () => {
    expect(resolveTimeOption(["full"], "range")).toBe("full");
    expect(resolveTimeOption(["range"], "full")).toBe("range");
  });

  it("falls back to range when nothing is allowed", () => {
    expect(resolveTimeOption([], "full")).toBe("range");
    expect(resolveTimeOption([], "")).toBe("range");
  });
});

describe("amPmSuffix", () => {
  it("appends the shared indicator when start and end match", () => {
    expect(amPmSuffix("AM", "AM")).toBe("AM");
    expect(amPmSuffix("PM", "PM")).toBe("PM");
  });

  it("renders no suffix for mixed or missing indicators", () => {
    expect(amPmSuffix("AM", "PM")).toBe("");
    expect(amPmSuffix("PM", "AM")).toBe("");
    expect(amPmSuffix("", "AM")).toBe("");
    expect(amPmSuffix("AM", "")).toBe("");
    expect(amPmSuffix("", "")).toBe("");
  });
});
