import { describe, expect, it } from "vitest";

import {
  MIN_SWAP_HEIGHT_DELTA_PX,
  recordSkeletonHeight,
  shouldAnimateSwapHeight,
} from "./swapHeight";

describe("recordSkeletonHeight", () => {
  it("records a laid-out height", () => {
    expect(recordSkeletonHeight(null, 148)).toBe(148);
    expect(recordSkeletonHeight(120, 148)).toBe(148);
  });

  it("never records an un-laid-out read (0 / negative / non-finite)", () => {
    expect(recordSkeletonHeight(null, 0)).toBeNull();
    expect(recordSkeletonHeight(148, 0)).toBe(148);
    expect(recordSkeletonHeight(148, -12)).toBe(148);
    expect(recordSkeletonHeight(148, Number.NaN)).toBe(148);
    expect(recordSkeletonHeight(148, Number.POSITIVE_INFINITY)).toBe(148);
  });
});

describe("shouldAnimateSwapHeight", () => {
  it("animates a real skeleton -> content change in either direction", () => {
    expect(shouldAnimateSwapHeight(148, 420)).toBe(true);
    expect(shouldAnimateSwapHeight(420, 148)).toBe(true);
  });

  it("does not animate without a measured skeleton (the kept-mounted display:none window)", () => {
    expect(shouldAnimateSwapHeight(null, 420)).toBe(false);
    expect(shouldAnimateSwapHeight(0, 420)).toBe(false);
    expect(shouldAnimateSwapHeight(-4, 420)).toBe(false);
    expect(shouldAnimateSwapHeight(Number.NaN, 420)).toBe(false);
  });

  it("does not animate to an un-measured content height", () => {
    expect(shouldAnimateSwapHeight(148, 0)).toBe(false);
    expect(shouldAnimateSwapHeight(148, -1)).toBe(false);
    expect(shouldAnimateSwapHeight(148, Number.NaN)).toBe(false);
  });

  it("skips a sub-pixel difference", () => {
    expect(shouldAnimateSwapHeight(148, 148)).toBe(false);
    expect(shouldAnimateSwapHeight(148, 148 + MIN_SWAP_HEIGHT_DELTA_PX / 2)).toBe(false);
  });

  it("animates exactly at the minimum delta", () => {
    expect(shouldAnimateSwapHeight(148, 148 + MIN_SWAP_HEIGHT_DELTA_PX)).toBe(true);
  });
});
