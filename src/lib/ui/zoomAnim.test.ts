import { describe, expect, it } from "vitest";

import { cubicBezier, zoomEase } from "./zoomAnim";

describe("cubicBezier", () => {
  it("is the identity for a linear curve", () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const x of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
      expect(linear(x)).toBeCloseTo(x, 5);
    }
  });

  it("clamps outside [0, 1]", () => {
    expect(zoomEase(-1)).toBe(0);
    expect(zoomEase(0)).toBe(0);
    expect(zoomEase(1)).toBe(1);
    expect(zoomEase(2)).toBe(1);
  });
});

describe("zoomEase", () => {
  it("matches the CSS cubic-bezier(0.22, 1, 0.36, 1): a fast ease-out", () => {
    const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
    expect(zoomEase(0.25)).toBeGreaterThan(easeOutCubic(0.25));
    expect(zoomEase(0.5)).toBeGreaterThan(easeOutCubic(0.5));
    expect(zoomEase(0.25)).toBeCloseTo(0.765, 1);
    expect(zoomEase(0.5)).toBeCloseTo(0.96, 1);
  });

  it("is monotonically increasing across the curve", () => {
    let previous = -1;
    for (let i = 0; i <= 100; i++) {
      const value = zoomEase(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});
