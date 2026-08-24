import { describe, expect, it } from "vitest";

import {
  CALENDAR_COLORS,
  colorForCalendar,
  effectiveCalendarColor,
  isCalendarColor,
  normalizeCalendarColor,
} from "./calendarColors";

describe("isCalendarColor", () => {
  it("accepts only palette members", () => {
    for (const color of CALENDAR_COLORS) {
      expect(isCalendarColor(color)).toBe(true);
    }
    expect(isCalendarColor("purple")).toBe(false);
    expect(isCalendarColor("")).toBe(false);
    expect(isCalendarColor(null)).toBe(false);
    expect(isCalendarColor({ color: "blue" })).toBe(false);
  });
});

describe("normalizeCalendarColor", () => {
  it("passes through valid palette names", () => {
    expect(normalizeCalendarColor("blue")).toBe("blue");
    expect(normalizeCalendarColor("pink")).toBe("pink");
  });

  it("falls back to null (auto) for missing/unknown values", () => {
    expect(normalizeCalendarColor(undefined)).toBeNull();
    expect(normalizeCalendarColor(null)).toBeNull();
    expect(normalizeCalendarColor("")).toBeNull();
    expect(normalizeCalendarColor("auto")).toBeNull();
    expect(normalizeCalendarColor("purple")).toBeNull();
    expect(normalizeCalendarColor(42)).toBeNull();
  });
});

describe("colorForCalendar", () => {
  it("is stable for a given id", () => {
    expect(colorForCalendar("abc-123")).toBe(colorForCalendar("abc-123"));
  });

  it("always yields a palette member", () => {
    for (const id of ["", "a", "01234567-89ab-4def-8123-456789abcdef", "x".repeat(36)]) {
      expect(CALENDAR_COLORS).toContain(colorForCalendar(id));
    }
  });

  it("distributes distinct ids across the palette", () => {
    const seen = new Set(Array.from({ length: 50 }, (_, i) => colorForCalendar(`id-${i}`)));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("effectiveCalendarColor", () => {
  it("prefers the pinned color when set", () => {
    expect(effectiveCalendarColor("id-1", "red")).toBe("red");
  });

  it("falls back to the deterministic default when unset or invalid", () => {
    expect(effectiveCalendarColor("id-1", null)).toBe(colorForCalendar("id-1"));
    expect(effectiveCalendarColor("id-1", "")).toBe(colorForCalendar("id-1"));
    expect(effectiveCalendarColor("id-1", "bogus")).toBe(colorForCalendar("id-1"));
  });
});
