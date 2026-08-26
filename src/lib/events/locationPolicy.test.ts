import { describe, expect, it } from "vitest";

import {
  clampOutOfCamp,
  isLocationPolicy,
  LOCATION_POLICY_DESCRIPTIONS,
  LOCATION_POLICY_LABELS,
  normalizeLocationPolicy,
} from "./locationPolicy";

describe("isLocationPolicy", () => {
  it("accepts the canonical values", () => {
    expect(isLocationPolicy("in")).toBe(true);
    expect(isLocationPolicy("out")).toBe(true);
    expect(isLocationPolicy("both")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isLocationPolicy("camp")).toBe(false);
    expect(isLocationPolicy("")).toBe(false);
    expect(isLocationPolicy(null)).toBe(false);
    expect(isLocationPolicy(42)).toBe(false);
  });
});

describe("normalizeLocationPolicy", () => {
  it("passes through valid policies", () => {
    expect(normalizeLocationPolicy("in")).toBe("in");
    expect(normalizeLocationPolicy("out")).toBe("out");
    expect(normalizeLocationPolicy("both")).toBe("both");
  });

  it("falls back to 'both' for missing/unknown values", () => {
    expect(normalizeLocationPolicy(undefined)).toBe("both");
    expect(normalizeLocationPolicy(null)).toBe("both");
    expect(normalizeLocationPolicy("camp")).toBe("both");
    expect(normalizeLocationPolicy(1)).toBe("both");
  });
});

describe("clampOutOfCamp", () => {
  it("'in' forces the flag off and clears the location", () => {
    expect(clampOutOfCamp("in", true, "Hall A")).toEqual({ outOfCamp: false, location: "" });
    expect(clampOutOfCamp("in", false, "")).toEqual({ outOfCamp: false, location: "" });
  });

  it("'out' forces the flag on and keeps the location", () => {
    expect(clampOutOfCamp("out", false, "Hall A")).toEqual({ outOfCamp: true, location: "Hall A" });
    expect(clampOutOfCamp("out", true, "")).toEqual({ outOfCamp: true, location: "" });
  });

  it("'both' keeps the location only while out of camp", () => {
    expect(clampOutOfCamp("both", true, "Hall A")).toEqual({ outOfCamp: true, location: "Hall A" });
    expect(clampOutOfCamp("both", false, "Hall A")).toEqual({
      outOfCamp: false,
      location: "",
    });
    expect(clampOutOfCamp("both", false, "")).toEqual({ outOfCamp: false, location: "" });
  });
});

describe("labels and descriptions", () => {
  it("covers every policy exactly once", () => {
    expect(Object.keys(LOCATION_POLICY_LABELS).sort()).toEqual(["both", "in", "out"]);
    expect(Object.keys(LOCATION_POLICY_DESCRIPTIONS).sort()).toEqual(["both", "in", "out"]);
    for (const policy of ["in", "out", "both"] as const) {
      expect(LOCATION_POLICY_LABELS[policy].length).toBeGreaterThan(0);
      expect(LOCATION_POLICY_DESCRIPTIONS[policy].length).toBeGreaterThan(0);
    }
  });
});
