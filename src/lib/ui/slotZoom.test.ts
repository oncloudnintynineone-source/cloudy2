import { describe, expect, it } from "vitest";

import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_LEVELS,
  clampZoom,
  daySlotWidth,
  gridWeekSlotHeight,
  reanchorScrollLeft,
  reanchorScrollTop,
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

describe("gridWeekSlotHeight", () => {
  it("matches the 56px default at zoom 1", () => {
    expect(gridWeekSlotHeight(1)).toBe("calc(3.5rem * var(--mantine-scale))");
  });

  it("scales the base by the zoom level", () => {
    expect(gridWeekSlotHeight(0.5)).toBe("calc(1.75rem * var(--mantine-scale))");
    expect(gridWeekSlotHeight(1.25)).toBe("calc(4.375rem * var(--mantine-scale))");
    expect(gridWeekSlotHeight(2)).toBe("calc(7rem * var(--mantine-scale))");
  });
});

describe("reanchorScrollTop", () => {
  it("keeps the viewport-center time stable when zooming in", () => {
    // Center sits 300px into the timeline; doubling the slot height keeps that
    // time centered at 300px.
    expect(reanchorScrollTop(0, 600, 1, 2)).toBeCloseTo(300);
  });

  it("is symmetric zooming out", () => {
    expect(reanchorScrollTop(300, 600, 2, 1)).toBeCloseTo(0);
  });

  it("is the identity for an unchanged zoom", () => {
    expect(reanchorScrollTop(150, 600, 1, 1)).toBeCloseTo(150);
  });

  it("returns the original offset for degenerate inputs", () => {
    expect(reanchorScrollTop(100, 0, 1, 2)).toBe(100);
    expect(reanchorScrollTop(100, 600, 0, 2)).toBe(100);
    expect(reanchorScrollTop(100, 600, 1, 0)).toBe(100);
  });
});

describe("reanchorScrollLeft", () => {
  it("keeps the viewport-center time stable when zooming in", () => {
    // 60px slots → 120px. Center sits 200px into the timeline (after a 100px
    // label column), i.e. hour 3.333; that hour must stay centered.
    const next = reanchorScrollLeft(0, 600, 100, 60, 120);
    expect(next).toBeCloseTo(200);
  });

  it("is symmetric zooming out", () => {
    // Reverse of the previous case: 120px → 60px, center at hour 3.333 again.
    const next = reanchorScrollLeft(200, 600, 100, 120, 60);
    expect(next).toBeCloseTo(0);
  });

  it("reduces to the naive ratio when there is no label column", () => {
    // Center is at 300px of a zero-offset timeline; doubling the slot width
    // keeps that time centered at 300px (300 * 2 - 300).
    expect(reanchorScrollLeft(0, 600, 0, 60, 120)).toBeCloseTo(300);
  });

  it("accounts for the label column separately from the timeline", () => {
    // scrollLeft 0, viewport 500, no zoom change → identity regardless of label.
    expect(reanchorScrollLeft(0, 500, 100, 80, 80)).toBeCloseTo(0);
    // A non-zero scroll offset with equal slots returns the offset unchanged.
    expect(reanchorScrollLeft(150, 500, 100, 80, 80)).toBeCloseTo(150);
  });

  it("returns the original offset for degenerate inputs", () => {
    expect(reanchorScrollLeft(100, 0, 50, 60, 120)).toBe(100);
    expect(reanchorScrollLeft(100, 500, 50, 0, 120)).toBe(100);
    expect(reanchorScrollLeft(100, 500, 50, 60, 0)).toBe(100);
  });
});
