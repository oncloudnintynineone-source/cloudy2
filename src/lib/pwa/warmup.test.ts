import { describe, expect, it } from "vitest";

import { shouldPreloadTabs, shouldWarmRoutes } from "./warmup";

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

describe("shouldPreloadTabs", () => {
  it("preloads on a capable device with a good connection", () => {
    expect(
      shouldPreloadTabs({
        hardwareConcurrency: 8,
        deviceMemory: 8,
        onLine: true,
        effectiveType: "4g",
      }),
    ).toBe(true);
  });

  it("does not preload on a low-end device even with a good connection", () => {
    expect(
      shouldPreloadTabs({
        hardwareConcurrency: 4,
        deviceMemory: 2,
        onLine: true,
        effectiveType: "4g",
      }),
    ).toBe(false);
  });

  it("does not preload on a constrained connection even on a capable device", () => {
    expect(shouldPreloadTabs({ hardwareConcurrency: 8, deviceMemory: 8, onLine: true, saveData: true })).toBe(
      false,
    );
    expect(
      shouldPreloadTabs({ hardwareConcurrency: 8, deviceMemory: 8, onLine: true, effectiveType: "2g" }),
    ).toBe(false);
    expect(shouldPreloadTabs({ hardwareConcurrency: 8, deviceMemory: 8, onLine: false })).toBe(false);
  });

  it("treats missing signals as capable", () => {
    expect(shouldPreloadTabs({})).toBe(true);
  });
});
