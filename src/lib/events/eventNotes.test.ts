import { describe, expect, it } from "vitest";

import {
  encodeEventNotes,
  eventNotesFromInput,
  parseEventRegistrationCap,
  parseEventRegistrationEnabled,
} from "./notes";
import type { EventFormValues } from "./validate";

function values(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    title: "Open day",
    timeOption: "range",
    startAmPm: "AM",
    endAmPm: "PM",
    start: "2026-08-21 09:00:00",
    end: "2026-08-21 10:00:00",
    eventType: "Training",
    creatorId: "creator-1",
    inviteeUserIds: [],
    inviteeDepartments: [],
    registrationEnabled: false,
    registrationCap: null,
    ownerOnlyEdits: false,
    outOfCamp: false,
    overseas: false,
    pinned: false,
    pinnedDepartments: [],
    location: "",
    ...overrides,
  };
}

describe("eventNotesFromInput", () => {
  it("persists the per-event registration flag and cap", () => {
    const description = encodeEventNotes(
      eventNotesFromInput(
        "e-1",
        values({
          registrationEnabled: true,
          registrationCap: 5,
          ownerOnlyEdits: true,
          inviteeUserIds: ["u-2"],
        }),
      ),
    );

    expect(parseEventRegistrationEnabled(description)).toBe(true);
    expect(parseEventRegistrationCap(description)).toBe(5);
  });

  it("omits the flag when registration is off", () => {
    const description = encodeEventNotes(eventNotesFromInput("e-1", values()));

    expect(description).not.toContain("registrationEnabled");
    expect(parseEventRegistrationEnabled(description)).toBe(false);
  });

  it("omits the cap when unlimited", () => {
    const description = encodeEventNotes(
      eventNotesFromInput("e-1", values({ registrationEnabled: true, registrationCap: null })),
    );

    expect(parseEventRegistrationCap(description)).toBeNull();
  });
});
