import { describe, expect, it } from "vitest";

import type { GcalEventItem } from "@/lib/google/types";

import { encodeEventNotes } from "./notes";
import {
  applyRegistrationIntent,
  eventFormValuesFromCopy,
  isRegistrationFull,
  registrationSeatCount,
} from "./registration";

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

describe("registrationSeatCount / isRegistrationFull", () => {
  it("counts unique non-empty explicit registrants", () => {
    expect(registrationSeatCount(["u-1", "u-1", "", "u-2"])).toBe(2);
    expect(registrationSeatCount(null)).toBe(0);
    expect(registrationSeatCount(undefined)).toBe(0);
  });

  it("treats a null cap as unlimited", () => {
    expect(isRegistrationFull(["u-1", "u-2"], null)).toBe(false);
    expect(isRegistrationFull(["u-1", "u-2"], undefined)).toBe(false);
  });

  it("is full at or above the cap for a non-registered user", () => {
    expect(isRegistrationFull(["u-1", "u-2"], 3, "u-9")).toBe(false);
    expect(isRegistrationFull(["u-1", "u-2", "u-3"], 3, "u-9")).toBe(true);
    expect(isRegistrationFull(["u-1", "u-2", "u-3"], 3, "u-1")).toBe(false);
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
      registrationEnabled: false,
      registrationCap: null,
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

  it("reads a stored registration flag and cap", () => {
    const values = eventFormValuesFromCopy(
      copy({
        description: encodeEventNotes({
          eventId: "e-1",
          eventType: "Training",
          title: "Open day",
          createdBy: "creator-1",
          timeOption: "range",
          registrationEnabled: true,
          registrationCap: 6,
        }),
      }),
    );
    expect(values?.registrationEnabled).toBe(true);
    expect(values?.registrationCap).toBe(6);
  });

  it("returns null when the copy has no parseable notes", () => {
    expect(eventFormValuesFromCopy(copy({ description: "not notes" }))).toBeNull();
  });
});
