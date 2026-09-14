import { describe, expect, it } from "vitest";

import { pinchAxis, pinchDistance, pinchMidpoint, pinchScale } from "./pinch";

describe("pinchDistance", () => {
  it("measures the spread between two points", () => {
    expect(pinchDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(pinchDistance({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(0);
  });
});

describe("pinchMidpoint", () => {
  it("is the point halfway between the fingers", () => {
    expect(pinchMidpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
    expect(pinchMidpoint({ x: -4, y: 6 }, { x: 4, y: 2 })).toEqual({ x: 0, y: 4 });
  });
});

describe("pinchAxis", () => {
  it("is horizontal when the fingers are side by side", () => {
    expect(pinchAxis({ x: 0, y: 0 }, { x: 40, y: 10 })).toBe("x");
  });

  it("is vertical when the fingers are stacked", () => {
    expect(pinchAxis({ x: 0, y: 0 }, { x: 10, y: 40 })).toBe("y");
  });

  it("breaks a tie toward horizontal", () => {
    expect(pinchAxis({ x: 0, y: 0 }, { x: 20, y: 20 })).toBe("x");
    expect(pinchAxis({ x: 0, y: 0 }, { x: -20, y: 20 })).toBe("x");
  });
});

describe("pinchScale", () => {
  it("is the spread ratio relative to the gesture start", () => {
    expect(pinchScale(100, 200)).toBe(2);
    expect(pinchScale(100, 50)).toBe(0.5);
    expect(pinchScale(100, 100)).toBe(1);
  });

  it("degrades to 1 for a degenerate or non-finite start", () => {
    expect(pinchScale(0, 200)).toBe(1);
    expect(pinchScale(100, 0)).toBe(1);
    expect(pinchScale(Number.NaN, 100)).toBe(1);
    expect(pinchScale(100, Number.POSITIVE_INFINITY)).toBe(1);
  });
});
