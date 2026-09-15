import { describe, expect, it } from "vitest";

import { isLowEndDevice } from "./lowEndDevice";

describe("isLowEndDevice", () => {
  it("flags a device low on both cores and memory", () => {
    expect(isLowEndDevice({ hardwareConcurrency: 4, deviceMemory: 2 })).toBe(true);
  });

  it("does not flag a device with many cores", () => {
    expect(isLowEndDevice({ hardwareConcurrency: 8, deviceMemory: 2 })).toBe(false);
  });

  it("does not flag a device with plenty of memory", () => {
    expect(isLowEndDevice({ hardwareConcurrency: 4, deviceMemory: 8 })).toBe(false);
  });

  it("treats missing signals as not-low-end", () => {
    expect(isLowEndDevice({})).toBe(false);
    expect(isLowEndDevice({ hardwareConcurrency: 4 })).toBe(false);
    expect(isLowEndDevice({ deviceMemory: 2 })).toBe(false);
  });

  it("ignores zero/invalid values", () => {
    expect(isLowEndDevice({ hardwareConcurrency: 0, deviceMemory: 0 })).toBe(false);
  });
});
