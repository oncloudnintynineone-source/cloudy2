import { describe, expect, it } from "vitest";

import {
  EVENT_COLORS,
  colorForId,
  effectiveCalendarColor,
  effectiveEventTypeColor,
  formatColorLabel,
  isEventColor,
  normalizeEventColor,
} from "./eventColors";

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

describe("isEventColor", () => {
  it("accepts only palette members", () => {
    for (const color of EVENT_COLORS) {
      expect(isEventColor(color)).toBe(true);
    }
  });

  it("rejects non-strings and unknown names", () => {
    expect(isEventColor("purple")).toBe(false);
    expect(isEventColor(42)).toBe(false);
    expect(isEventColor(null)).toBe(false);
    expect(isEventColor({ color: "blue" })).toBe(false);
  });
});

describe("normalizeEventColor", () => {
  it("accepts palette colors", () => {
    expect(normalizeEventColor("blue")).toBe("blue");
    expect(normalizeEventColor("pink")).toBe("pink");
  });

  it("falls back to null for empty, auto, or unknown values", () => {
    expect(normalizeEventColor(undefined)).toBeNull();
    expect(normalizeEventColor(null)).toBeNull();
    expect(normalizeEventColor("")).toBeNull();
    expect(normalizeEventColor("auto")).toBeNull();
    expect(normalizeEventColor("purple")).toBeNull();
    expect(normalizeEventColor(42)).toBeNull();
  });
});

describe("colorForId", () => {
  it("is stable for a given id", () => {
    expect(colorForId("abc-123")).toBe(colorForId("abc-123"));
  });

  it("always lands on the palette", () => {
    for (let i = 0; i < 20; i += 1) {
      const id = `id-${i}`;
      expect(EVENT_COLORS).toContain(colorForId(id));
    }
  });

  it("spreads ids across the palette", () => {
    const seen = new Set(Array.from({ length: 50 }, (_, i) => colorForId(`id-${i}`)));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("effectiveEventTypeColor", () => {
  it("prefers the pinned color when set", () => {
    expect(effectiveEventTypeColor("Leave", "red")).toBe("red");
  });

  it("falls back to the name-derived default", () => {
    expect(effectiveEventTypeColor("Leave", null)).toBe(colorForId("Leave"));
    expect(effectiveEventTypeColor("Leave", "")).toBe(colorForId("Leave"));
    expect(effectiveEventTypeColor("Leave", "bogus")).toBe(colorForId("Leave"));
  });
});

describe("effectiveCalendarColor", () => {
  it("prefers the pinned color when set", () => {
    expect(effectiveCalendarColor("id-1", "red")).toBe("red");
  });

  it("falls back to the id-derived default", () => {
    expect(effectiveCalendarColor("id-1", null)).toBe(colorForId("id-1"));
    expect(effectiveCalendarColor("id-1", "")).toBe(colorForId("id-1"));
    expect(effectiveCalendarColor("id-1", "bogus")).toBe(colorForId("id-1"));
  });
});

describe("formatColorLabel", () => {
  it("capitalizes a pinned color", () => {
    expect(formatColorLabel("blue", "Leave")).toBe("Blue");
  });

  it("labels an unset color as Auto with the id-derived default", () => {
    const defaultColor = colorForId("Leave");
    expect(formatColorLabel(null, "Leave")).toBe(`Auto (${capitalize(defaultColor)})`);
    expect(formatColorLabel("", "Leave")).toBe(`Auto (${capitalize(defaultColor)})`);
  });
});
