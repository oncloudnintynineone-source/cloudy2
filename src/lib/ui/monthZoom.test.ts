import { describe, expect, it } from "vitest";

import {
  MAX_MONTH_ZOOM,
  MIN_MONTH_ZOOM,
  MONTH_ZOOM_LEVELS,
  clampMonthZoom,
  monthFillEvents,
  monthFitChipCount,
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

describe("monthFillEvents", () => {
  it("returns a fractional N that fills the box exactly (52 + N * 24 per row)", () => {
    // 6 rows in 800px: (800 - 6) / 6 = 132.33px per row -> 3.347 chip slots.
    const events = monthFillEvents(800, 6);
    if (events === null) throw new Error("a measured box must produce a fill value");
    expect(events).toBeCloseTo(((800 - 6) / 6 - 52) / 24, 10);
    const rowHeight = 52 + events * 24;
    expect(rowHeight * 6 + 6).toBeCloseTo(800, 6);
  });

  it("passes the natural four-chip height through when the box matches it", () => {
    // 148px rows = 52 + 4 * 24 exactly, borders included.
    expect(monthFillEvents(148 * 5 + 5, 5)).toBe(4);
  });

  it("respects a caller floor (dual pane keeps the natural 148px row)", () => {
    // Short box: the 148 floor wins, so the pane keeps its natural scroll.
    const events = monthFillEvents(400, 4, 148);
    expect(events).toBe(4);
  });

  it("floors at one chip slot at the default minimum", () => {
    // Degenerate box: one 24px slot minimum (row = 76px -> N = 1).
    expect(monthFillEvents(10, 4)).toBe(1);
  });

  it("returns null for unmeasured or invalid input", () => {
    expect(monthFillEvents(0, 5)).toBeNull();
    expect(monthFillEvents(-40, 5)).toBeNull();
    expect(monthFillEvents(800, 0)).toBeNull();
    expect(monthFillEvents(Number.NaN, 5)).toBeNull();
    expect(monthFillEvents(Number.POSITIVE_INFINITY, 5)).toBeNull();
  });
});

describe("monthFitChipCount", () => {
  it("keeps the cap while the fitted row can hold 21px slots", () => {
    // 136px rows -> 84px chip area -> exactly four 21px slots.
    expect(monthFitChipCount((52 + 84) * 5 + 5, 5)).toBe(4);
    expect(monthFitChipCount(1205, 5)).toBe(4); // tall rows still cap at 4
  });

  it("shrinks the count when the fitted row can't hold the cap", () => {
    // 135px rows -> 83px area -> three slots.
    expect(monthFitChipCount(680, 5)).toBe(3);
    // 94px rows -> 42px area -> two slots.
    expect(monthFitChipCount(475, 5)).toBe(2);
    // 93px rows -> 41px area -> one slot.
    expect(monthFitChipCount(470, 5)).toBe(1);
  });

  it("never lets a fitted row fall into the 9px auto-size text tier", () => {
    // The library's chip is `slot - 2px` tall and its `@container (max-height:
    // 18px)` rule drops the text to 9px, so every slot must stay above 20px.
    for (const n of [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6]) {
      const count = monthFitChipCount((52 + 24 * n) * 5 + 5, 5);
      expect(count).not.toBeNull();
      expect((24 * n) / (count as number) - 2).toBeGreaterThan(18);
    }
  });

  it("never drops below one chip", () => {
    // Degenerate row: the count floors at 1.
    expect(monthFitChipCount(100, 4)).toBe(1);
  });

  it("returns null for unmeasured or invalid input", () => {
    expect(monthFitChipCount(0, 5)).toBeNull();
    expect(monthFitChipCount(400, 0)).toBeNull();
    expect(monthFitChipCount(Number.NaN, 5)).toBeNull();
  });
});
