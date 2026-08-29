import { describe, expect, it } from "vitest";

import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_LEVELS,
  clampZoom,
  daySlotWidth,
  stepZoom,
  weekSlotWidth,
} from "./slotZoom";

describe("clampZoom", () => {
  it("passes a known level through unchanged", () => {
    for (const level of ZOOM_LEVELS) {
      expect(clampZoom(level)).toBe(level);
    }
  });

  it("snaps an off-level number to the nearest level", () => {
    expect(clampZoom(1.1)).toBe(1);
    expect(clampZoom(1.4)).toBe(1.5);
    expect(clampZoom(0.3)).toBe(0.5);
    expect(clampZoom(3)).toBe(2);
  });

  it("returns null for non-numeric or non-finite input", () => {
    expect(clampZoom("2")).toBeNull();
    expect(clampZoom(null)).toBeNull();
    expect(clampZoom(undefined)).toBeNull();
    expect(clampZoom({})).toBeNull();
    expect(clampZoom(Number.NaN)).toBeNull();
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("stepZoom", () => {
  it("steps one notch in each direction", () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(0.5, 1)).toBe(0.75);
    expect(stepZoom(2, -1)).toBe(1.5);
  });

  it("clamps at the extremes instead of looping", () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });
});

describe("weekSlotWidth", () => {
  it("matches the current fixed widths at zoom 1 (60px mobile / 72px desktop)", () => {
    expect(weekSlotWidth(1, false)).toBe("calc(3.75rem * var(--mantine-scale))");
    expect(weekSlotWidth(1, true)).toBe("calc(4.5rem * var(--mantine-scale))");
  });

  it("scales the base by the zoom level", () => {
    expect(weekSlotWidth(0.5, false)).toBe("calc(1.875rem * var(--mantine-scale))");
    expect(weekSlotWidth(0.75, false)).toBe("calc(2.8125rem * var(--mantine-scale))");
    expect(weekSlotWidth(2, true)).toBe("calc(9rem * var(--mantine-scale))");
  });
});

describe("daySlotWidth", () => {
  it("matches Mantine's 80px default at zoom 1", () => {
    expect(daySlotWidth(1)).toBe("calc(5rem * var(--mantine-scale))");
  });

  it("scales the base by the zoom level at every breakpoint", () => {
    expect(daySlotWidth(0.5)).toBe("calc(2.5rem * var(--mantine-scale))");
    expect(daySlotWidth(1.5)).toBe("calc(7.5rem * var(--mantine-scale))");
    expect(daySlotWidth(2)).toBe("calc(10rem * var(--mantine-scale))");
  });
});
