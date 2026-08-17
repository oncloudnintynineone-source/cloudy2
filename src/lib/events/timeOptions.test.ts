import { describe, expect, it } from "vitest";

import {
  isTimeOption,
  normalizeTimeOptions,
  resolveTimeOption,
  resolveTimeOptions,
} from "./timeOptions";

describe("isTimeOption", () => {
  it("accepts the canonical values", () => {
    expect(isTimeOption("range")).toBe(true);
    expect(isTimeOption("ampm")).toBe(true);
    expect(isTimeOption("full")).toBe(true);
  });

  it("rejects anything else", () => {
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

  it("drops unknown values and dedupes", () => {
    expect(normalizeTimeOptions(["ampm", "half", "ampm", null, "full"])).toEqual([
      "ampm",
      "full",
    ]);
  });

  it("returns [] for non-arrays", () => {
    expect(normalizeTimeOptions(null)).toEqual([]);
    expect(normalizeTimeOptions("range")).toEqual([]);
  });
});

describe("resolveTimeOptions", () => {
  it("passes through a non-empty list", () => {
    expect(resolveTimeOptions(["ampm"])).toEqual(["ampm"]);
  });

  it("falls back to the default range behaviour when empty", () => {
    expect(resolveTimeOptions([])).toEqual(["range"]);
  });
});

describe("resolveTimeOption", () => {
  it("returns the selection when allowed", () => {
    expect(resolveTimeOption(["ampm", "full"], "ampm")).toBe("ampm");
  });

  it("falls back to the first allowed option when not allowed", () => {
    expect(resolveTimeOption(["ampm", "full"], "range")).toBe("ampm");
    expect(resolveTimeOption(["full"], "ampm")).toBe("full");
  });

  it("falls back to range when nothing is allowed", () => {
    expect(resolveTimeOption([], "ampm")).toBe("range");
    expect(resolveTimeOption([], "")).toBe("range");
  });
});
