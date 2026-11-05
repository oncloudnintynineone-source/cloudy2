import { describe, expect, it } from "vitest";

import { shouldUsePeriodSlide, type PeriodSlideConditions } from "./periodSlide";

const desktop: PeriodSlideConditions = {
  kind: "month",
  loading: false,
  coarsePointer: false,
  lowEnd: false,
};

describe("shouldUsePeriodSlide", () => {
  it("allows the real slide on desktop for a loaded grid", () => {
    expect(shouldUsePeriodSlide(desktop)).toBe(true);
  });

  it("rejects every grid while it is still loading", () => {
    expect(shouldUsePeriodSlide({ ...desktop, loading: true })).toBe(false);
    expect(shouldUsePeriodSlide({ ...desktop, kind: "agenda", loading: true })).toBe(false);
  });

  it("rejects the low-end device tier", () => {
    expect(shouldUsePeriodSlide({ ...desktop, lowEnd: true })).toBe(false);
  });

  it("keeps heavy grids on the nudge on touch devices", () => {
    for (const kind of ["month", "dual", "week", "weekv2", "weekgrid", "schedule"] as const) {
      expect(shouldUsePeriodSlide({ ...desktop, kind, coarsePointer: true })).toBe(false);
    }
  });

  it("still slides the Agenda list on touch devices", () => {
    expect(shouldUsePeriodSlide({ ...desktop, kind: "agenda", coarsePointer: true })).toBe(true);
  });

  it("keeps the real slide for heavy grids on a fine pointer even at desktop sizes", () => {
    expect(shouldUsePeriodSlide({ ...desktop, kind: "week", coarsePointer: false })).toBe(true);
  });
});
