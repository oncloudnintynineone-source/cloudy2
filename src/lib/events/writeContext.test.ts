import { describe, expect, it } from "vitest";

import type { EventFormValues } from "./validate";
import { resolveEventFields, type EventTitleContext } from "./writeContext";

const values: EventFormValues = {
  title: "Open day",
  timeOption: "range",
  startAmPm: "",
  endAmPm: "",
  start: "2026-08-21 09:00:00",
  end: "2026-08-21 10:00:00",
  eventType: "Training",
  creatorId: "creator-1",
  inviteeUserIds: ["u-1"],
  inviteeDepartments: ["cal-1"],
  registrationCap: 8,
  ownerOnlyEdits: false,
  outOfCamp: false,
  overseas: false,
  pinned: false,
  location: "",
};

function context(overrides: Partial<EventTitleContext> = {}): EventTitleContext {
  return {
    recipe: { segments: [] },
    eventType: { name: "Training", acronym: "TRN" },
    people: [],
    departments: [],
    timeOptions: ["range"],
    allowedLocations: ["in", "out", "overseas"],
    showRemarks: true,
    showInvitees: true,
    registrationEnabled: true,
    showLocation: true,
    excludeFromClash: false,
    ...overrides,
  };
}

describe("resolveEventFields", () => {
  it("strips department tags and keeps the cap for registration events", () => {
    const result = resolveEventFields(values, context());
    expect(result.inviteeDepartments).toEqual([]);
    expect(result.registrationCap).toBe(8);
    expect(result.registrationEnabled).toBe(true);
    expect(result.ownerOnlyEdits).toBe(true);
  });

  it("normalizes an invalid registration cap to unlimited", () => {
    const result = resolveEventFields({ ...values, registrationCap: 0 }, context());
    expect(result.registrationCap).toBeNull();
  });

  it("clears the cap for non-registration events", () => {
    const result = resolveEventFields(
      values,
      context({ registrationEnabled: false, eventType: { name: "Meeting", acronym: "MTG" } }),
    );
    expect(result.registrationCap).toBeNull();
    expect(result.registrationEnabled).toBe(false);
  });
});
