import { describe, expect, it } from "vitest";

import { createdEventSummary, eventIdFromAuditDetails } from "./history";

describe("eventIdFromAuditDetails", () => {
  it("reads the group id from a snapshot payload", () => {
    expect(eventIdFromAuditDetails({ eventId: "abc-123", title: "X" })).toBe("abc-123");
  });

  it("returns null for missing/blank/non-object details", () => {
    expect(eventIdFromAuditDetails(null)).toBeNull();
    expect(eventIdFromAuditDetails(undefined)).toBeNull();
    expect(eventIdFromAuditDetails({})).toBeNull();
    expect(eventIdFromAuditDetails({ eventId: "" })).toBeNull();
    expect(eventIdFromAuditDetails({ eventId: 42 })).toBeNull();
    expect(eventIdFromAuditDetails("eventId")).toBeNull();
    expect(eventIdFromAuditDetails([{ eventId: "abc" }])).toBeNull();
  });
});

describe("createdEventSummary", () => {
  it("parses a full snapshot into a display record", () => {
    expect(
      createdEventSummary({
        eventId: "e1",
        title: "Range Day",
        time: "2026-08-21 14:00 \u2013 15:30",
        departments: ["Alpha", "Bravo"],
        invitees: ["Sam", "Lee"],
        creator: "Sam",
        location: "Changi",
        type: "Training",
      }),
    ).toEqual({
      eventId: "e1",
      title: "Range Day",
      time: "2026-08-21 14:00 \u2013 15:30",
      departments: ["Alpha", "Bravo"],
      invitees: ["Sam", "Lee"],
      creator: "Sam",
      location: "Changi",
      type: "Training",
    });
  });

  it("blanks missing optional fields rather than failing", () => {
    expect(createdEventSummary({ eventId: "e2" })).toEqual({
      eventId: "e2",
      title: null,
      time: "",
      departments: [],
      invitees: [],
      creator: null,
      location: null,
      type: null,
    });
  });

  it("drops non-string entries from name arrays", () => {
    const summary = createdEventSummary({
      eventId: "e3",
      departments: ["Alpha", 7, null],
      invitees: ["Sam", {}],
    });
    expect(summary?.departments).toEqual(["Alpha"]);
    expect(summary?.invitees).toEqual(["Sam"]);
  });

  it("returns null when the payload has no group id", () => {
    expect(createdEventSummary({ title: "No id" })).toBeNull();
    expect(createdEventSummary(null)).toBeNull();
    expect(createdEventSummary({ eventId: "   " })).toBeNull();
  });
});
