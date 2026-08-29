import { describe, expect, it } from "vitest";

import {
  categoryFromFlags,
  clampLocationCategory,
  clampOutOfCamp,
  flagsFromCategory,
  isLocationCategory,
  LOCATION_CATEGORY_DESCRIPTIONS,
  LOCATION_CATEGORY_LABELS,
  normalizeAllowedLocations,
} from "./locationPolicy";

describe("isLocationCategory", () => {
  it("accepts the canonical values", () => {
    expect(isLocationCategory("in")).toBe(true);
    expect(isLocationCategory("out")).toBe(true);
    expect(isLocationCategory("overseas")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isLocationCategory("both")).toBe(false);
    expect(isLocationCategory("camp")).toBe(false);
    expect(isLocationCategory("")).toBe(false);
    expect(isLocationCategory(null)).toBe(false);
    expect(isLocationCategory(42)).toBe(false);
  });
});

describe("normalizeAllowedLocations", () => {
  it("dedupes and drops unknown entries", () => {
    expect(normalizeAllowedLocations(["in", "in", "overseas", "camp"])).toEqual(["in", "overseas"]);
  });

  it("falls back to all categories for non-arrays and empty results", () => {
    expect(normalizeAllowedLocations(undefined)).toEqual(["in", "out", "overseas"]);
    expect(normalizeAllowedLocations(null)).toEqual(["in", "out", "overseas"]);
    expect(normalizeAllowedLocations([])).toEqual(["in", "out", "overseas"]);
    expect(normalizeAllowedLocations(["camp"])).toEqual(["in", "out", "overseas"]);
  });
});

describe("categoryFromFlags / flagsFromCategory", () => {
  it("maps flags to a single category", () => {
    expect(categoryFromFlags(false, false)).toBe("in");
    expect(categoryFromFlags(true, false)).toBe("out");
    expect(categoryFromFlags(true, true)).toBe("overseas");
  });

  it("maps each category back to its flags", () => {
    expect(flagsFromCategory("in")).toEqual({ outOfCamp: false, overseas: false });
    expect(flagsFromCategory("out")).toEqual({ outOfCamp: true, overseas: false });
    expect(flagsFromCategory("overseas")).toEqual({ outOfCamp: true, overseas: true });
  });

  it("round-trips categories through the flags", () => {
    for (const category of ["in", "out", "overseas"] as const) {
      expect(categoryFromFlags(flagsFromCategory(category).outOfCamp, flagsFromCategory(category).overseas)).toBe(
        category,
      );
    }
  });
});

describe("clampLocationCategory", () => {
  it("keeps an allowed category", () => {
    expect(clampLocationCategory(["in", "out", "overseas"], "overseas")).toBe("overseas");
  });

  it("clamps to the first allowed category when outside the allowlist", () => {
    expect(clampLocationCategory(["in"], "overseas")).toBe("in");
    expect(clampLocationCategory(["out", "overseas"], "in")).toBe("out");
    expect(clampLocationCategory(["overseas"], "in")).toBe("overseas");
    expect(clampLocationCategory([], "in")).toBe("in");
  });
});

describe("clampOutOfCamp", () => {
  it("forces in camp when only 'in' is allowed, clearing the overseas flag but keeping the location", () => {
    expect(clampOutOfCamp(["in"], true, true, "Abroad")).toEqual({
      outOfCamp: false,
      overseas: false,
      location: "Abroad",
    });
    expect(clampOutOfCamp(["in"], false, false, "")).toEqual({
      outOfCamp: false,
      overseas: false,
      location: "",
    });
  });

  it("keeps the destination for an allowed out-of-camp category", () => {
    expect(clampOutOfCamp(["out", "overseas"], false, false, "Hall A")).toEqual({
      outOfCamp: true,
      overseas: false,
      location: "Hall A",
    });
  });

  it("forces overseas when only 'overseas' is allowed", () => {
    expect(clampOutOfCamp(["overseas"], false, false, "Beijing")).toEqual({
      outOfCamp: true,
      overseas: true,
      location: "Beijing",
    });
  });

  it("always keeps the location string, in or out of camp", () => {
    expect(clampOutOfCamp(["in", "out", "overseas"], true, true, "Beijing")).toEqual({
      outOfCamp: true,
      overseas: true,
      location: "Beijing",
    });
    expect(clampOutOfCamp(["in", "out", "overseas"], true, false, "Town")).toEqual({
      outOfCamp: true,
      overseas: false,
      location: "Town",
    });
    // An in-camp event keeps its specific location (never implies out of camp).
    expect(clampOutOfCamp(["in", "out", "overseas"], false, true, "Block 5, Hall 2")).toEqual({
      outOfCamp: false,
      overseas: false,
      location: "Block 5, Hall 2",
    });
    expect(clampOutOfCamp(["in", "out", "overseas"], false, false, "")).toEqual({
      outOfCamp: false,
      overseas: false,
      location: "",
    });
  });

  it("clamps an out-of-policy category into the allowlist", () => {
    // Type allows out-of-camp (and overseas), user picked in camp → clamps to out.
    expect(clampOutOfCamp(["out", "overseas"], false, false, "")).toEqual({
      outOfCamp: true,
      overseas: false,
      location: "",
    });
    // Type allows in + overseas but not local out — an out-of-camp-local pick
    // clamps to the first allowed category (in camp), keeping the destination.
    expect(clampOutOfCamp(["in", "overseas"], true, false, "Town")).toEqual({
      outOfCamp: false,
      overseas: false,
      location: "Town",
    });
  });
});

describe("labels and descriptions", () => {
  it("covers every category exactly once", () => {
    expect(Object.keys(LOCATION_CATEGORY_LABELS).sort()).toEqual(["in", "out", "overseas"]);
    expect(Object.keys(LOCATION_CATEGORY_DESCRIPTIONS).sort()).toEqual(["in", "out", "overseas"]);
    for (const category of ["in", "out", "overseas"] as const) {
      expect(LOCATION_CATEGORY_LABELS[category].length).toBeGreaterThan(0);
      expect(LOCATION_CATEGORY_DESCRIPTIONS[category].length).toBeGreaterThan(0);
    }
  });
});
