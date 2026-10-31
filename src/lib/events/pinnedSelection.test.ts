import { describe, expect, it } from "vitest";

import {
  PINNED_CACHE_FRESH_MS,
  decodePinnedSelection,
  pinnedCacheIsFresh,
} from "./pinnedSelection";
import type { CalendarEvent } from "./queries";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "cal:g",
    title: "Title",
    start: "2026-09-01 09:00:00",
    end: "2026-09-01 10:00:00",
    color: "blue",
    payload: {
      calendarId: "cal",
      googleEventId: "g",
      allDay: false,
      eventType: null,
      calendarName: "A Dept",
      eventId: null,
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
      pinned: true,
      location: "",
      external: false,
    },
    ...overrides,
  };
}

describe("decodePinnedSelection", () => {
  it("accepts a stored selection of calendar events", () => {
    const selection = [event(), event({ id: "cal:g2" })];
    expect(decodePinnedSelection(selection)).toEqual(selection);
  });

  it("returns null for a non-array value", () => {
    expect(decodePinnedSelection({ events: [] })).toBeNull();
    expect(decodePinnedSelection(null)).toBeNull();
  });

  it("returns null when an event is missing the fields the shaping path reads", () => {
    const malformed = { ...event(), payload: { ...event().payload, inviteeUserIds: undefined } };
    expect(decodePinnedSelection([malformed])).toBeNull();
  });

  it("returns null when a payload field has the wrong type", () => {
    const malformed = { ...event(), payload: { ...event().payload, allDay: "yes" } };
    expect(decodePinnedSelection([malformed])).toBeNull();
  });

  it("accepts an empty selection (cached 'nothing pinned')", () => {
    expect(decodePinnedSelection([])).toEqual([]);
  });

  it("accepts scoped pin lists and old rows without the field", () => {
    const scoped = {
      ...event(),
      payload: { ...event().payload, pinnedDepartments: ["dept-a"] },
    };
    expect(decodePinnedSelection([scoped])).toEqual([scoped]);
    expect(decodePinnedSelection([event()])).toEqual([event()]);
  });
});

describe("pinnedCacheIsFresh", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");

  it("is fresh inside the window", () => {
    expect(pinnedCacheIsFresh(new Date(now.getTime() - 1), now)).toBe(true);
    expect(pinnedCacheIsFresh(new Date(now.getTime() - (PINNED_CACHE_FRESH_MS - 1)), now)).toBe(
      true,
    );
  });

  it("is stale at and beyond the window", () => {
    expect(pinnedCacheIsFresh(new Date(now.getTime() - PINNED_CACHE_FRESH_MS), now)).toBe(false);
    expect(pinnedCacheIsFresh(new Date(now.getTime() - PINNED_CACHE_FRESH_MS - 1), now)).toBe(
      false,
    );
  });
});
