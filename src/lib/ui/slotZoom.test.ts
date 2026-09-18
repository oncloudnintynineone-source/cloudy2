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
  it("keeps the 56px base and multiplies by the row-zoom CSS var", () => {
    expect(gridWeekSlotHeight("var(--c2-row-zoom, 1)")).toBe(
      "calc(3.5rem * var(--mantine-scale) * var(--c2-row-zoom, 1))",
    );
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
