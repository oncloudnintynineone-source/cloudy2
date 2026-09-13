import { describe, expect, it } from "vitest";

import {
  DUAL_SPLIT_DEFAULT,
  DUAL_SPLIT_MAX,
  DUAL_SPLIT_MIN,
  DUAL_SPLIT_STEP,
  clampDualSplit,
  stepDualSplit,
} from "./dualSplit";

describe("clampDualSplit", () => {
  it("passes an in-band value through", () => {
    expect(clampDualSplit(0.6)).toBe(0.6);
    expect(clampDualSplit(DUAL_SPLIT_MIN)).toBe(DUAL_SPLIT_MIN);
    expect(clampDualSplit(DUAL_SPLIT_MAX)).toBe(DUAL_SPLIT_MAX);
    expect(clampDualSplit(DUAL_SPLIT_DEFAULT)).toBe(DUAL_SPLIT_DEFAULT);
  });

  it("clamps out-of-band values to the band", () => {
    expect(clampDualSplit(0.1)).toBe(DUAL_SPLIT_MIN);
    expect(clampDualSplit(0.9)).toBe(DUAL_SPLIT_MAX);
    expect(clampDualSplit(-5)).toBe(DUAL_SPLIT_MIN);
    expect(clampDualSplit(42)).toBe(DUAL_SPLIT_MAX);
  });

  it("rounds to two decimals so stepping can't drift", () => {
    expect(clampDualSplit(0.6349)).toBe(0.63);
    expect(clampDualSplit(0.6351)).toBe(0.64);
  });

  it("returns null for non-numeric or non-finite input", () => {
    expect(clampDualSplit("0.6")).toBeNull();
    expect(clampDualSplit(null)).toBeNull();
    expect(clampDualSplit(undefined)).toBeNull();
    expect(clampDualSplit({})).toBeNull();
    expect(clampDualSplit(Number.NaN)).toBeNull();
    expect(clampDualSplit(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("stepDualSplit", () => {
  it("steps one notch in each direction", () => {
    expect(stepDualSplit(0.6, 1)).toBe(0.65);
    expect(stepDualSplit(0.6, -1)).toBe(0.55);
    expect(DUAL_SPLIT_STEP).toBe(0.05);
  });

  it("clamps at the band instead of looping", () => {
    expect(stepDualSplit(DUAL_SPLIT_MAX, 1)).toBe(DUAL_SPLIT_MAX);
    expect(stepDualSplit(DUAL_SPLIT_MIN, -1)).toBe(DUAL_SPLIT_MIN);
  });

  it("falls back to the default basis for a junk value", () => {
    expect(stepDualSplit(Number.NaN, 1)).toBe(0.65);
    expect(stepDualSplit(Number.NaN, -1)).toBe(0.55);
  });
});
