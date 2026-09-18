import { describe, expect, it } from "vitest";

import { shouldWarmRoutes } from "./warmup";

describe("shouldWarmRoutes", () => {
  it("warms on a fast, unmetered, online connection", () => {
    expect(shouldWarmRoutes({ onLine: true, saveData: false, effectiveType: "4g" })).toBe(true);
  });

  it("treats missing signals as capable (no connection API)", () => {
    expect(shouldWarmRoutes({})).toBe(true);
    expect(shouldWarmRoutes({ onLine: true })).toBe(true);
  });

  it("does not warm while offline", () => {
    expect(shouldWarmRoutes({ onLine: false, effectiveType: "4g" })).toBe(false);
  });

  it("does not warm in data-saver mode", () => {
    expect(shouldWarmRoutes({ onLine: true, saveData: true, effectiveType: "4g" })).toBe(false);
  });

  it("does not warm on very slow connections", () => {
    expect(shouldWarmRoutes({ onLine: true, effectiveType: "slow-2g" })).toBe(false);
    expect(shouldWarmRoutes({ onLine: true, effectiveType: "2g" })).toBe(false);
  });

  it("warms on 3g and 4g", () => {
    expect(shouldWarmRoutes({ onLine: true, effectiveType: "3g" })).toBe(true);
    expect(shouldWarmRoutes({ onLine: true, effectiveType: "4g" })).toBe(true);
  });
});
