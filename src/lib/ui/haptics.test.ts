import { describe, expect, it } from "vitest";

import { HAPTIC_PATTERNS, hapticPattern } from "./haptics";

describe("hapticPattern", () => {
  it("returns the pattern for every kind", () => {
    expect(hapticPattern("light")).toBe(HAPTIC_PATTERNS.light);
    expect(hapticPattern("medium")).toBe(HAPTIC_PATTERNS.medium);
    expect(hapticPattern("success")).toEqual([10, 40, 10]);
    expect(hapticPattern("warning")).toEqual([16, 50, 16]);
    expect(hapticPattern("error")).toEqual([30, 40, 30]);
  });

  it("keeps every pattern short enough to read as feedback, not a buzz", () => {
    for (const pattern of Object.values(HAPTIC_PATTERNS)) {
      const total = Array.isArray(pattern)
        ? pattern.reduce((sum, part) => sum + part, 0)
        : pattern;
      expect(total).toBeLessThanOrEqual(110);
    }
  });
});
