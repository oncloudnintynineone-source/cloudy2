import { describe, expect, it } from "vitest";

import {
  MAX_MONTH_ZOOM,
  MIN_MONTH_ZOOM,
  MONTH_ZOOM_LEVELS,
  clampMonthZoom,
  stepMonthZoom,
} from "./monthZoom";

describe("clampMonthZoom", () => {
  it("passes a known level through unchanged", () => {
    for (const level of MONTH_ZOOM_LEVELS) {
      expect(clampMonthZoom(level)).toBe(level);
    }
  });

  it("snaps an off-level number to the nearest level", () => {
    expect(clampMonthZoom(1.1)).toBe(1);
    expect(clampMonthZoom(1.4)).toBe(1.5);
    expect(clampMonthZoom(0.3)).toBe(1);
    expect(clampMonthZoom(2.6)).toBe(2.5);
    expect(clampMonthZoom(3.4)).toBe(3);
    expect(clampMonthZoom(5)).toBe(5);
    expect(clampMonthZoom(99)).toBe(6);
  });

  it("returns null for non-numeric or non-finite input", () => {
    expect(clampMonthZoom("2")).toBeNull();
    expect(clampMonthZoom(null)).toBeNull();
    expect(clampMonthZoom(undefined)).toBeNull();
    expect(clampMonthZoom({})).toBeNull();
    expect(clampMonthZoom(Number.NaN)).toBeNull();
    expect(clampMonthZoom(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("stepMonthZoom", () => {
  it("steps one notch in each direction", () => {
    expect(stepMonthZoom(1, 1)).toBe(1.25);
    expect(stepMonthZoom(1.25, 1)).toBe(1.5);
    expect(stepMonthZoom(3, -1)).toBe(2.5);
    expect(stepMonthZoom(1.5, -1)).toBe(1.25);
    // The doubled top end gains whole-number levels.
    expect(stepMonthZoom(3, 1)).toBe(4);
    expect(stepMonthZoom(5, 1)).toBe(6);
    expect(stepMonthZoom(6, -1)).toBe(5);
  });

  it("clamps at the extremes instead of looping", () => {
    expect(stepMonthZoom(MAX_MONTH_ZOOM, 1)).toBe(MAX_MONTH_ZOOM);
    // Fit (1) is the floor — zooming out never goes below the fit width.
    expect(stepMonthZoom(MIN_MONTH_ZOOM, -1)).toBe(MIN_MONTH_ZOOM);
  });
});
