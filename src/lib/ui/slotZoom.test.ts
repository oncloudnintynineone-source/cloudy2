import { describe, expect, it } from "vitest";

import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_LEVELS,
  clampGridWeekColZoom,
  clampZoom,
  daySlotWidth,
  gridWeekColumnWidth,
  gridWeekSlotHeight,
  reanchorScrollLeft,
  reanchorScrollTop,
  stepZoom,
  weekMatrixDayMinPx,
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
    expect(clampZoom(0.3)).toBe(0.25);
    expect(clampZoom(2.3)).toBe(2.5);
    expect(clampZoom(3.4)).toBe(3);
    expect(clampZoom(5.4)).toBe(5);
    expect(clampZoom(99)).toBe(6);
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

describe("clampGridWeekColZoom", () => {
  it("passes a known level at or above fit through unchanged", () => {
    expect(clampGridWeekColZoom(1)).toBe(1);
    expect(clampGridWeekColZoom(1.5)).toBe(1.5);
    expect(clampGridWeekColZoom(2)).toBe(2);
    expect(clampGridWeekColZoom(2.5)).toBe(2.5);
    expect(clampGridWeekColZoom(3)).toBe(3);
  });

  it("snaps an off-level number, flooring below fit at 1", () => {
    expect(clampGridWeekColZoom(1.4)).toBe(1.5);
    expect(clampGridWeekColZoom(0.75)).toBe(1);
    expect(clampGridWeekColZoom(0.5)).toBe(1);
  });

  it("returns null for non-numeric or non-finite input", () => {
    expect(clampGridWeekColZoom("2")).toBeNull();
    expect(clampGridWeekColZoom(null)).toBeNull();
    expect(clampGridWeekColZoom(undefined)).toBeNull();
    expect(clampGridWeekColZoom(Number.NaN)).toBeNull();
  });
});

describe("stepZoom", () => {
  it("steps one notch in each direction", () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(0.5, 1)).toBe(0.75);
    expect(stepZoom(2, -1)).toBe(1.5);
    expect(stepZoom(2, 1)).toBe(2.5);
    expect(stepZoom(2.5, -1)).toBe(2);
    // The doubled range: the new extremes step outward and the top end gains
    // whole-number levels.
    expect(stepZoom(0.25, 1)).toBe(0.5);
    expect(stepZoom(3, 1)).toBe(4);
    expect(stepZoom(5, 1)).toBe(6);
    expect(stepZoom(6, -1)).toBe(5);
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

describe("gridWeekColumnWidth", () => {
  it("is the fit-to-width 100% at zoom 1", () => {
    expect(gridWeekColumnWidth(1)).toBe("100%");
  });

  it("widens the columns when zoomed in past fit", () => {
    expect(gridWeekColumnWidth(1.25)).toBe("125%");
    expect(gridWeekColumnWidth(1.5)).toBe("150%");
    expect(gridWeekColumnWidth(2)).toBe("200%");
  });

  it("floors at 100% so zooming out never shrinks below the viewport width", () => {
    expect(gridWeekColumnWidth(0.75)).toBe("100%");
    expect(gridWeekColumnWidth(0.5)).toBe("100%");
  });
});

describe("weekMatrixDayMinPx", () => {
  it("is the default readable width (112px) at zoom 1", () => {
    expect(weekMatrixDayMinPx(1)).toBe(112);
  });

  it("scales the px floor by the zoom level", () => {
    expect(weekMatrixDayMinPx(2)).toBe(224);
    expect(weekMatrixDayMinPx(6)).toBe(672);
  });

  it("floors at the fit level so zooming out never narrows the columns", () => {
    expect(weekMatrixDayMinPx(0.75)).toBe(112);
    expect(weekMatrixDayMinPx(0.5)).toBe(112);
    expect(weekMatrixDayMinPx(0.25)).toBe(112);
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

  it("keeps a focal point (pinch midpoint) stable instead of the centre", () => {
    // Focal 150px into the timeline: doubling the slot height keeps the time
    // under the finger at 150px.
    expect(reanchorScrollTop(0, 600, 1, 2, 150)).toBeCloseTo(150);
    // Same focal with an existing scroll offset scales that time too.
    expect(reanchorScrollTop(100, 600, 1, 2, 100)).toBeCloseTo(300);
    // Focal at the top edge pins the first slot.
    expect(reanchorScrollTop(0, 600, 1, 2, 0)).toBeCloseTo(0);
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

  it("keeps a focal point (pinch midpoint) stable instead of the centre", () => {
    // No label column: the timeline point at x=100 stays at x=100 when 60px
    // slots become 120px.
    expect(reanchorScrollLeft(0, 600, 0, 60, 120, 100)).toBeCloseTo(100);
    // With a label column: the point at viewport x=200 stays put (the label
    // is subtracted before scaling and re-added after).
    expect(reanchorScrollLeft(0, 600, 100, 60, 120, 200)).toBeCloseTo(100);
    // Symmetric zooming out.
    expect(reanchorScrollLeft(100, 600, 100, 120, 60, 200)).toBeCloseTo(0);
  });
});
