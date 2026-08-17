import { describe, expect, it } from "vitest";

import {
  encodeEventNotes,
  parseEventAmPm,
  parseEventNotes,
  parseEventPeople,
  parseEventTimeOption,
  parseEventType,
  parseEventTitle,
} from "./notes";

describe("encodeEventNotes", () => {
  it("serializes a non-empty notes object as JSON", () => {
    expect(encodeEventNotes({ eventType: "Leave" })).toBe('{"eventType":"Leave"}');
  });

  it("drops empty values", () => {
    expect(encodeEventNotes({ eventType: "" })).toBe("");
    expect(encodeEventNotes({})).toBe("");
  });

  it("drops empty arrays", () => {
    expect(encodeEventNotes({ inviteeUsers: [], inviteeDepartments: [] })).toBe("");
    expect(encodeEventNotes({ eventType: "Leave", inviteeUsers: [] })).toBe(
      '{"eventType":"Leave"}',
    );
  });

  it("keeps people fields when present", () => {
    expect(
      encodeEventNotes({
        eventType: "Leave",
        createdBy: "u1",
        inviteeUsers: ["u2", "u3"],
        inviteeDepartments: ["cal-1"],
      }),
    ).toBe(
      '{"eventType":"Leave","createdBy":"u1","inviteeUsers":["u2","u3"],"inviteeDepartments":["cal-1"]}',
    );
  });

  it("keeps future extra fields", () => {
    expect(encodeEventNotes({ eventType: "Leave", kahGroup: "G1" })).toBe(
      '{"eventType":"Leave","kahGroup":"G1"}',
    );
  });

  it("keeps the time option and AM/PM indicator", () => {
    expect(
      encodeEventNotes({ eventType: "Leave", timeOption: "ampm", amPm: "PM" }),
    ).toBe('{"eventType":"Leave","timeOption":"ampm","amPm":"PM"}');
  });

  it("drops the AM/PM indicator for non-ampm events", () => {
    expect(encodeEventNotes({ eventType: "Leave", timeOption: "full", amPm: undefined })).toBe(
      '{"eventType":"Leave","timeOption":"full"}',
    );
  });
});

describe("parseEventNotes", () => {
  it("parses a JSON object", () => {
    expect(parseEventNotes('{"eventType":"Leave"}')).toEqual({ eventType: "Leave" });
  });

  it("returns null for empty, malformed, or non-object JSON", () => {
    expect(parseEventNotes("")).toBeNull();
    expect(parseEventNotes("not json")).toBeNull();
    expect(parseEventNotes('["a"]')).toBeNull();
    expect(parseEventNotes("42")).toBeNull();
  });
});

describe("parseEventType", () => {
  it("extracts the event type name", () => {
    expect(parseEventType('{"eventType":"Leave"}')).toBe("Leave");
  });

  it("returns null when no event type is present", () => {
    expect(parseEventType("")).toBeNull();
    expect(parseEventType('{"other":1}')).toBeNull();
    expect(parseEventType('{"eventType":""}')).toBeNull();
  });
});

describe("parseEventTitle", () => {
  it("extracts the raw description from notes", () => {
    expect(parseEventTitle('{"title":"Team offsite"}')).toBe("Team offsite");
  });

  it("returns null for legacy notes without a title", () => {
    expect(parseEventTitle("")).toBeNull();
    expect(parseEventTitle('{"eventType":"Leave"}')).toBeNull();
    expect(parseEventTitle('{"title":""}')).toBeNull();
    expect(parseEventTitle("not json")).toBeNull();
  });
});

describe("parseEventTimeOption", () => {
  it("extracts a valid time option", () => {
    expect(parseEventTimeOption('{"timeOption":"ampm"}')).toBe("ampm");
    expect(parseEventTimeOption('{"timeOption":"full"}')).toBe("full");
    expect(parseEventTimeOption('{"timeOption":"range"}')).toBe("range");
  });

  it("returns null for absent, empty, or invalid values", () => {
    expect(parseEventTimeOption("")).toBeNull();
    expect(parseEventTimeOption('{"eventType":"Leave"}')).toBeNull();
    expect(parseEventTimeOption('{"timeOption":""}')).toBeNull();
    expect(parseEventTimeOption('{"timeOption":"half"}')).toBeNull();
  });
});

describe("parseEventAmPm", () => {
  it("extracts AM or PM", () => {
    expect(parseEventAmPm('{"amPm":"AM"}')).toBe("AM");
    expect(parseEventAmPm('{"amPm":"PM"}')).toBe("PM");
  });

  it("returns null for absent or invalid values", () => {
    expect(parseEventAmPm("")).toBeNull();
    expect(parseEventAmPm('{"timeOption":"full"}')).toBeNull();
    expect(parseEventAmPm('{"amPm":"MIDDAY"}')).toBeNull();
  });
});

describe("parseEventPeople", () => {
  it("extracts group id, creator, users, and departments", () => {
    expect(
      parseEventPeople(
        '{"eventId":"g-1","createdBy":"u1","inviteeUsers":["u2"],"inviteeDepartments":["cal-9"]}',
      ),
    ).toEqual({
      eventId: "g-1",
      creatorId: "u1",
      userIds: ["u2"],
      departmentIds: ["cal-9"],
    });
  });

  it("returns nothing for empty or malformed notes", () => {
    expect(parseEventPeople("")).toEqual({
      eventId: null,
      creatorId: null,
      userIds: [],
      departmentIds: [],
    });
    expect(parseEventPeople("not json")).toEqual({
      eventId: null,
      creatorId: null,
      userIds: [],
      departmentIds: [],
    });
  });

  it("ignores non-string entries and dedupes", () => {
    expect(
      parseEventPeople(
        '{"eventId":"","createdBy":"","inviteeUsers":["u1",42,"u1",null],"inviteeDepartments":"nope"}',
      ),
    ).toEqual({ eventId: null, creatorId: null, userIds: ["u1"], departmentIds: [] });
  });
});
