import { describe, expect, it } from "vitest";

import {
  COLD_START_WAIT_LINES,
  DOUBLE_BOOKING_WAIT_LINES,
  DOUBLE_BOOKING_WAIT_TIPS,
  KAH_STATUS_WAIT_LINES,
  KAH_STATUS_WAIT_TIPS,
  MY_EVENTS_WAIT_LINES,
  MY_EVENTS_WAIT_TIPS,
  pickRotating,
} from "./waitCopy";

/** Every headline set shares the same quality contract. */
const ALL_LINES = {
  MY_EVENTS_WAIT_LINES,
  COLD_START_WAIT_LINES,
  DOUBLE_BOOKING_WAIT_LINES,
  KAH_STATUS_WAIT_LINES,
} as const;

const ALL_TIPS = {
  MY_EVENTS_WAIT_TIPS,
  DOUBLE_BOOKING_WAIT_TIPS,
  KAH_STATUS_WAIT_TIPS,
} as const;

describe("wait copy quality", () => {
  for (const [name, lines] of Object.entries(ALL_LINES)) {
    it(`${name}: unique, non-empty, fits one phone line`, () => {
      expect(lines.length).toBeGreaterThan(2);
      expect(new Set(lines).size).toBe(lines.length);
      for (const line of lines) {
        expect(line.length).toBeGreaterThan(0);
        expect(line.length).toBeLessThanOrEqual(48);
      }
    });
  }

  for (const [name, tips] of Object.entries(ALL_TIPS)) {
    it(`${name}: unique and bounded`, () => {
      expect(tips.length).toBeGreaterThan(1);
      expect(new Set(tips).size).toBe(tips.length);
      for (const tip of tips) {
        expect(tip.length).toBeGreaterThan(0);
        expect(tip.length).toBeLessThanOrEqual(64);
      }
    });
  }
});

describe("pickRotating", () => {
  const items = ["a", "b", "c"];

  it("picks by tick and wraps around", () => {
    expect(pickRotating(items, 0)).toBe("a");
    expect(pickRotating(items, 2)).toBe("c");
    expect(pickRotating(items, 3)).toBe("a");
    expect(pickRotating(items, 7)).toBe("b");
  });

  it("returns an empty string for an empty list (decorative, never throws)", () => {
    expect(pickRotating([], 0)).toBe("");
    expect(pickRotating([], 5)).toBe("");
  });
});
