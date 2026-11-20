import { describe, expect, it } from "vitest";

import {
  DEFAULT_USER_CLASH_AHEAD_MONTHS,
  parseUserClashAhead,
  userClashWindow,
} from "./clashRange";

describe("parseUserClashAhead", () => {
  it("accepts the app-wide look-aheads", () => {
    expect(parseUserClashAhead("1")).toBe(1);
    expect(parseUserClashAhead(6)).toBe(6);
    expect(parseUserClashAhead("12")).toBe(12);
  });

  it("falls back to the 1-month default", () => {
    expect(DEFAULT_USER_CLASH_AHEAD_MONTHS).toBe(1);
    expect(parseUserClashAhead("3")).toBe(DEFAULT_USER_CLASH_AHEAD_MONTHS);
    expect(parseUserClashAhead("0")).toBe(DEFAULT_USER_CLASH_AHEAD_MONTHS);
    expect(parseUserClashAhead("")).toBe(DEFAULT_USER_CLASH_AHEAD_MONTHS);
    expect(parseUserClashAhead(null)).toBe(DEFAULT_USER_CLASH_AHEAD_MONTHS);
  });
});

describe("userClashWindow", () => {
  it("runs from today through the end of the month ahead", () => {
    expect(userClashWindow("2026-11-21", 1)).toEqual({
      windowStart: "2026-11-21",
      windowEnd: "2026-12-31",
    });
    expect(userClashWindow("2026-11-21", 12)).toEqual({
      windowStart: "2026-11-21",
      windowEnd: "2027-11-30",
    });
  });
});
