import { describe, expect, it } from "vitest";

import type { GcalEventItem } from "@/lib/google/types";

import { encodeEventNotes } from "./notes";
import { applyRegistrationIntent, eventFormValuesFromCopy } from "./registration";

function copy(overrides: Partial<GcalEventItem> = {}): GcalEventItem {
  return {
    id: "g-1",
    calendarId: "google-cal-1",
    title: "Rendered title",
    description: encodeEventNotes({
      eventId: "e-1",
      eventType: "Training",
      title: "Open day",
      createdBy: "creator-1",
      inviteeUsers: ["u-2"],
      timeOption: "range",
    }),
    start: new Date("2026-08-21T01:00:00Z"),
    end: new Date("2026-08-21T02:30:00Z"),
    allDay: false,
    location: "Hall A",
    ...overrides,
  };
}

describe("applyRegistrationIntent", () => {
  it("adds the user once and preserves existing order", () => {
    expect(applyRegistrationIntent(["u-1"], "u-2", "register")).toEqual(["u-1", "u-2"]);
    expect(applyRegistrationIntent(["u-1", "u-2"], "u-2", "register")).toEqual(["u-1", "u-2"]);
  });

  it("removes every matching entry and is idempotent", () => {
    expect(applyRegistrationIntent(["u-1", "u-2"], "u-1", "deregister")).toEqual(["u-2"]);
    expect(applyRegistrationIntent(["u-2"], "u-1", "deregister")).toEqual(["u-2"]);
  });
});

describe("eventFormValuesFromCopy", () => {
  it("rebuilds a timed event from the stored notes", () => {
    const values = eventFormValuesFromCopy(copy());
    expect(values).not.toBeNull();
    expect(values).toMatchObject({
      title: "Open day",
      timeOption: "range",
      start: "2026-08-21 09:00:00",
      end: "2026-08-21 10:30:00",
      eventType: "Training",
      creatorId: "creator-1",
      inviteeUserIds: ["u-2"],
      inviteeDepartments: [],
      location: "Hall A",
    });
  });

  it("converts Google's exclusive all-day end back to the inclusive form date", () => {
    const values = eventFormValuesFromCopy(
      copy({
        description: encodeEventNotes({
          eventId: "e-1",
          eventType: "Training",
          title: "Open day",
          createdBy: "creator-1",
          timeOption: "full",
        }),
        start: new Date("2026-08-21T00:00:00Z"),
        end: new Date("2026-08-24T00:00:00Z"),
        allDay: true,
        location: "",
      }),
    );
    expect(values).toMatchObject({
      timeOption: "full",
      start: "2026-08-21 00:00:00",
      end: "2026-08-23 00:00:00",
      inviteeUserIds: [],
    });
  });

  it("returns null when the copy has no parseable notes", () => {
    expect(eventFormValuesFromCopy(copy({ description: "not notes" }))).toBeNull();
  });
});
