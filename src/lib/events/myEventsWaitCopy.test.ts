import { describe, expect, it } from "vitest";

import {
  MY_EVENTS_WAIT_LINES,
  MY_EVENTS_WAIT_TIPS,
  pickRotating,
} from "./myEventsWaitCopy";

describe("My Events wait copy", () => {
  it("has headline lines that are unique and fit one phone line", () => {
    expect(MY_EVENTS_WAIT_LINES.length).toBeGreaterThan(3);
    expect(new Set(MY_EVENTS_WAIT_LINES).size).toBe(MY_EVENTS_WAIT_LINES.length);
    for (const line of MY_EVENTS_WAIT_LINES) {
      expect(line.length).toBeGreaterThan(0);
      expect(line.length).toBeLessThanOrEqual(48);
    }
  });

  it("has tips that are unique and bounded", () => {
    expect(MY_EVENTS_WAIT_TIPS.length).toBeGreaterThan(1);
    expect(new Set(MY_EVENTS_WAIT_TIPS).size).toBe(MY_EVENTS_WAIT_TIPS.length);
    for (const tip of MY_EVENTS_WAIT_TIPS) {
      expect(tip.length).toBeGreaterThan(0);
      expect(tip.length).toBeLessThanOrEqual(64);
    }
  });
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
