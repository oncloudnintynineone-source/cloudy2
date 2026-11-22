import { describe, expect, it } from "vitest";

import {
  collapseSeriesEvents,
  dedupeEventsByOccurrence,
  findEventByOccurrence,
  normalizeOriginalStartTime,
  occurrenceKey,
} from "./occurrence";
import type { CalendarEvent } from "./queries";

function event(overrides: {
  eventId: string | null;
  calendarId: string;
  googleEventId: string;
  start: string;
  recurringEventId?: string | null;
  originalStartTime?: string | null;
}): CalendarEvent {
  return {
    id: `${overrides.calendarId}:${overrides.googleEventId}`,
    title: overrides.eventId ?? "event",
    start: overrides.start,
    end: overrides.start,
    color: "gray",
    payload: {
      calendarId: overrides.calendarId,
      googleEventId: overrides.googleEventId,
      eventId: overrides.eventId,
      allDay: false,
      eventType: null,
      calendarName: overrides.calendarId,
      creatorId: null,
      inviteeUserIds: [],
      inviteeDepartmentIds: [],
      ownerOnlyEdits: false,
      registrationEnabled: false,
      registrationCap: null,
      rawTitle: null,
      timeOption: "range",
      startAmPm: null,
      endAmPm: null,
      outOfCamp: false,
      overseas: false,
      pinned: false,
      location: "",
      external: false,
      recurringEventId: overrides.recurringEventId ?? null,
      originalStartTime: overrides.originalStartTime ?? null,
    },
  };
}

describe("occurrenceKey", () => {
  it("collapses department copies of one occurrence but not different ones", () => {
    const a = occurrenceKey({
      eventId: "g",
      calendarId: "c1",
      googleEventId: "a",
      recurringEventId: "p1",
      originalStartTime: "2026-01-05 09:00:00",
    });
    const b = occurrenceKey({
      eventId: "g",
      calendarId: "c2",
      googleEventId: "b",
      recurringEventId: "p2",
      originalStartTime: "2026-01-05 09:00:00",
    });
    const next = occurrenceKey({
      eventId: "g",
      calendarId: "c1",
      googleEventId: "c",
      recurringEventId: "p1",
      originalStartTime: "2026-01-12 09:00:00",
    });
    expect(a).toBe(b);
    expect(a).not.toBe(next);
  });

  it("normalises all-day original slots to the civil date", () => {
    expect(
      normalizeOriginalStartTime(new Date("2026-01-05T00:00:00Z"), true),
    ).toBe("2026-01-05");
  });
});

describe("dedupeEventsByOccurrence", () => {
  it("keeps one department copy per occurrence and every occurrence", () => {
    const events = [
      event({
        eventId: "g",
        calendarId: "c1",
        googleEventId: "a1",
        start: "2026-01-05 09:00:00",
        recurringEventId: "p1",
        originalStartTime: "2026-01-05 09:00:00",
      }),
      event({
        eventId: "g",
        calendarId: "c2",
        googleEventId: "b1",
        start: "2026-01-05 09:00:00",
        recurringEventId: "p2",
        originalStartTime: "2026-01-05 09:00:00",
      }),
      event({
        eventId: "g",
        calendarId: "c1",
        googleEventId: "a2",
        start: "2026-01-12 09:00:00",
        recurringEventId: "p1",
        originalStartTime: "2026-01-12 09:00:00",
      }),
    ];
    const deduped = dedupeEventsByOccurrence(events);
    expect(deduped).toHaveLength(2);
    expect(deduped.map((row) => row.start)).toEqual([
      "2026-01-05 09:00:00",
      "2026-01-12 09:00:00",
    ]);
  });

  it("still collapses non-recurring group copies", () => {
    const events = [
      event({ eventId: "g", calendarId: "c1", googleEventId: "a", start: "2026-01-05 09:00:00" }),
      event({ eventId: "g", calendarId: "c2", googleEventId: "b", start: "2026-01-05 09:00:00" }),
    ];
    expect(dedupeEventsByOccurrence(events)).toHaveLength(1);
  });
});

describe("findEventByOccurrence / collapseSeriesEvents", () => {
  it("picks the occurrence whose start day matches the deep link date", () => {
    const events = [
      event({
        eventId: "g",
        calendarId: "c1",
        googleEventId: "a",
        start: "2026-01-05 09:00:00",
      }),
      event({
        eventId: "g",
        calendarId: "c1",
        googleEventId: "b",
        start: "2026-01-12 09:00:00",
      }),
    ];
    expect(findEventByOccurrence(events, "g", "2026-01-12")?.start).toBe(
      "2026-01-12 09:00:00",
    );
    expect(findEventByOccurrence(events, "g")?.start).toBe("2026-01-05 09:00:00");
  });

  it("collapses a series to its earliest occurrence for list surfaces", () => {
    const collapsed = collapseSeriesEvents([
      event({ eventId: "g", calendarId: "c1", googleEventId: "b", start: "2026-01-12 09:00:00" }),
      event({ eventId: "g", calendarId: "c1", googleEventId: "a", start: "2026-01-05 09:00:00" }),
      event({ eventId: null, calendarId: "c1", googleEventId: "x", start: "2026-01-03 09:00:00" }),
    ]);
    expect(collapsed.map((row) => row.start)).toEqual([
      "2026-01-03 09:00:00",
      "2026-01-05 09:00:00",
    ]);
  });
});
