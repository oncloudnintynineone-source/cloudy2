import { describe, expect, it } from "vitest";

import type { GcalEventItem } from "@/lib/google/types";

import { effectiveCalendarColor, effectiveEventTypeColor } from "./eventColors";
import {
  encodeEventNotes,
  encodeNotesBlock,
  INTERNAL_EVENT_MARKER,
  withEditLink,
  withInternalMarker,
} from "./notes";
import { mapCalendarItem } from "./queries";

const calendar = { id: "cal-a", name: "Alpha", color: null };
const noFilters = { typeFilter: [], userFilter: [] };

function item(overrides: Partial<GcalEventItem> = {}): GcalEventItem {
  return {
    id: "gcal-1",
    calendarId: "gcal-a",
    title: "Briefing",
    description: "",
    start: new Date("2026-09-10T02:00:00.000Z"),
    end: new Date("2026-09-10T03:00:00.000Z"),
    allDay: false,
    location: "HQ",
    ...overrides,
  };
}

/** A v3 description: Edit link + brotli block + internal marker. */
function v3(notes: Record<string, unknown>): string {
  return withInternalMarker(
    withEditLink(encodeNotesBlock(JSON.stringify(notes)), "http://x/dashboard?event=e1"),
  );
}

describe("mapCalendarItem", () => {
  it("maps a full v3 notes block into the payload", () => {
    const description = v3({
      eventId: "group-1",
      eventType: "Training",
      createdBy: "user-1",
      inviteeUsers: ["u2", "u2", "u3"],
      inviteeDepartments: ["cal-b"],
      ownerOnlyEdits: true,
      registrationEnabled: true,
      registrationCap: 12,
      title: "raw title",
      remarks: "Wear whites.",
      timeOption: "half",
      startAmPm: "AM",
      endAmPm: "PM",
      outOfCamp: true,
      overseas: true,
      pinned: true,
      pinnedDepartments: ["cal-b"],
    });
    const event = mapCalendarItem(calendar, item({ description }), noFilters, new Map());
    expect(event).not.toBeNull();
    expect(event!.payload).toEqual({
      calendarId: "cal-a",
      googleEventId: "gcal-1",
      allDay: false,
      eventType: "Training",
      calendarName: "Alpha",
      eventId: "group-1",
      creatorId: "user-1",
      inviteeUserIds: ["u2", "u3"],
      inviteeDepartmentIds: ["cal-b"],
      ownerOnlyEdits: true,
      registrationEnabled: true,
      registrationCap: 12,
      recurrence: null,
      recurrenceSummary: null,
      recurringEventId: null,
      originalStartTime: null,
      occurrenceOverride: false,
      rawTitle: "raw title",
      remarks: "Wear whites.",
      timeOption: "half",
      startAmPm: "AM",
      endAmPm: "PM",
      outOfCamp: true,
      overseas: true,
      pinned: true,
      pinnedDepartments: ["cal-b"],
      location: "HQ",
      external: false,
    });
    expect(event!.title).toBe("Briefing");
    expect(event!.color).toBe(effectiveEventTypeColor("Training", null));
  });

  it("maps a v2 description (raw JSON line under the Edit link)", () => {
    const description = `Edit: http://x\n${encodeEventNotes({ eventId: "g2", createdBy: "u1" })}`;
    const event = mapCalendarItem(calendar, item({ description }), noFilters, new Map());
    expect(event!.payload.eventId).toBe("g2");
    expect(event!.payload.creatorId).toBe("u1");
    expect(event!.payload.external).toBe(false);
    expect(event!.payload.timeOption).toBe("range");
  });

  it("maps a v1 description (the description is the JSON block alone)", () => {
    const description = encodeEventNotes({ eventType: "Leave", title: "" });
    const event = mapCalendarItem(calendar, item({ description }), noFilters, new Map());
    expect(event!.payload.eventType).toBe("Leave");
    expect(event!.payload.rawTitle).toBe("");
    // No marker and no block → still internal via the parseable v1 block.
    expect(event!.payload.external).toBe(false);
  });

  it("treats a plain description as external with default fields", () => {
    const event = mapCalendarItem(
      calendar,
      item({ description: "just notes", allDay: true }),
      noFilters,
      new Map(),
    );
    expect(event!.payload).toMatchObject({
      eventType: null,
      eventId: null,
      creatorId: null,
      inviteeUserIds: [],
      inviteeDepartmentIds: [],
      ownerOnlyEdits: false,
      registrationEnabled: false,
      registrationCap: null,
      rawTitle: null,
      remarks: "",
      timeOption: "full",
      startAmPm: null,
      endAmPm: null,
      outOfCamp: false,
      overseas: false,
      pinned: false,
      pinnedDepartments: [],
      external: true,
    });
    expect(event!.color).toBe(effectiveCalendarColor("cal-a", null));
  });

  it("keeps marker-only descriptions internal but notes-less", () => {
    const description = `Something\n\n${INTERNAL_EVENT_MARKER}`;
    const event = mapCalendarItem(calendar, item({ description }), noFilters, new Map());
    expect(event!.payload.external).toBe(false);
    expect(event!.payload.eventId).toBeNull();
  });

  it("tolerates a malformed block line", () => {
    const description = withInternalMarker("Edit: http://x\n!!!not-base64!!!");
    const event = mapCalendarItem(calendar, item({ description }), noFilters, new Map());
    expect(event!.payload.external).toBe(false);
    expect(event!.payload.eventType).toBeNull();
  });

  it("derives pinned from targeted departments alone", () => {
    const description = v3({ pinnedDepartments: ["cal-b"] });
    const event = mapCalendarItem(calendar, item({ description }), noFilters, new Map());
    expect(event!.payload.pinned).toBe(true);
    expect(event!.payload.pinnedDepartments).toEqual(["cal-b"]);
  });

  it("drops invalid registration caps", () => {
    for (const cap of [0, -3, 1.5, "12"]) {
      const description = v3({ registrationCap: cap });
      const event = mapCalendarItem(calendar, item({ description }), noFilters, new Map());
      expect(event!.payload.registrationCap).toBeNull();
    }
  });

  it("applies the type and user filters", () => {
    const description = v3({
      eventType: "Training",
      createdBy: "u1",
      inviteeUsers: ["u1"],
      inviteeDepartments: ["cal-b"],
    });
    const eventItem = item({ description });
    expect(
      mapCalendarItem(calendar, eventItem, { typeFilter: ["Leave"], userFilter: [] }, new Map()),
    ).toBeNull();
    expect(
      mapCalendarItem(calendar, eventItem, { typeFilter: [], userFilter: ["u9"] }, new Map()),
    ).toBeNull();
    expect(
      mapCalendarItem(
        calendar,
        eventItem,
        { typeFilter: ["Training"], userFilter: ["u1"] },
        new Map(),
      ),
    ).not.toBeNull();
  });
});
