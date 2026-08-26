import { describe, expect, it } from "vitest";

import { formatEventTimeBadge } from "./eventTimeBadge";

describe("formatEventTimeBadge", () => {
  it("shows times only for a same-day timed event", () => {
    const event = { start: "2026-08-20 08:00:00", end: "2026-08-20 12:00:00", allDay: false };
    expect(formatEventTimeBadge(event, "2026-08-20")).toBe("8:00 AM – 12:00 PM");
  });

  it("includes the start date when it falls before the shown day", () => {
    const event = { start: "2026-08-19 22:00:00", end: "2026-08-20 02:00:00", allDay: false };
    expect(formatEventTimeBadge(event, "2026-08-20")).toBe("Aug 19, 10:00 PM – 2:00 AM");
  });

  it("includes the end date when it falls after the shown day", () => {
    const event = { start: "2026-08-20 08:00:00", end: "2026-08-21 01:00:00", allDay: false };
    expect(formatEventTimeBadge(event, "2026-08-20")).toBe("8:00 AM – Aug 21, 1:00 AM");
  });

  it("includes dates on both bounds when neither is on the shown day", () => {
    const event = { start: "2026-08-19 08:00:00", end: "2026-08-21 08:00:00", allDay: false };
    expect(formatEventTimeBadge(event, "2026-08-20")).toBe("Aug 19, 8:00 AM – Aug 21, 8:00 AM");
  });

  it("shows just the date for a single-day all-day event", () => {
    const event = { start: "2026-08-20 00:00:00", end: "2026-08-21 00:00:00", allDay: true };
    expect(formatEventTimeBadge(event, "2026-08-20")).toBe("Aug 20");
  });

  it("shows an inclusive date range for a multi-day all-day event", () => {
    const event = { start: "2026-08-19 00:00:00", end: "2026-08-22 00:00:00", allDay: true };
    expect(formatEventTimeBadge(event, "2026-08-20")).toBe("Aug 19 – Aug 21");
  });
});