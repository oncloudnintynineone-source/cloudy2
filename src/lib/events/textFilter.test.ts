import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "@/lib/events/queries";

import { eventNameMatchesText, filterEventsByText } from "./textFilter";

function event(title: string, rawTitle: string | null): CalendarEvent {
  return {
    id: `id-${title}`,
    title,
    start: "2026-09-01T09:00:00",
    end: "2026-09-01T10:00:00",
    color: "brand",
    payload: { rawTitle } as CalendarEvent["payload"],
  };
}

describe("eventNameMatchesText", () => {
  it("matches the rendered title case-insensitively", () => {
    expect(eventNameMatchesText(null, "Night Duty — HQ", "duty")).toBe(true);
  });

  it("matches the typed raw name when the rendered title differs", () => {
    expect(eventNameMatchesText("Logistics", "[AM] Logistics — HQ", "logis")).toBe(true);
  });

  it("treats a blank query as matching everything", () => {
    expect(eventNameMatchesText(null, "Anything", "   ")).toBe(true);
  });

  it("returns false when neither field contains the query", () => {
    expect(eventNameMatchesText("Logistics", "Logistics — HQ", "medical")).toBe(false);
  });
});

describe("filterEventsByText", () => {
  it("returns the same array unchanged for a blank query", () => {
    const events = [event("Alpha", null), event("Beta", "Beta")];
    expect(filterEventsByText(events, null)).toBe(events);
    expect(filterEventsByText(events, "  ")).toBe(events);
  });

  it("keeps only matching events", () => {
    const events = [event("Alpha — HQ", "Alpha"), event("Night Duty", "Night Duty")];
    expect(filterEventsByText(events, "duty").map((e) => e.title)).toEqual(["Night Duty"]);
  });
});
