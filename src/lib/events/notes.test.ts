import { describe, expect, it } from "vitest";

import {
  encodeEventNotes,
  eventEditUrl,
  parseEventEndAmPm,
  parseEventNotes,
  parseEventPeople,
  parseEventStartAmPm,
  parseEventTimeOption,
  parseEventType,
  parseEventTitle,
  withEditLink,
} from "./notes";

describe("encodeEventNotes", () => {
  it("serializes a non-empty notes object as JSON", () => {
    expect(encodeEventNotes({ eventType: "Leave" })).toBe('{"eventType":"Leave"}');
  });

  it("drops empty values", () => {
    expect(encodeEventNotes({ eventType: "" })).toBe("");
    expect(encodeEventNotes({})).toBe("");
  });

  it("keeps a deliberately empty title so it round-trips", () => {
    expect(encodeEventNotes({ title: "" })).toBe('{"title":""}');
    expect(encodeEventNotes({ title: "", eventType: "Leave" })).toBe(
      '{"title":"","eventType":"Leave"}',
    );
    expect(encodeEventNotes({ title: "Team offsite" })).toBe('{"title":"Team offsite"}');
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

  it("keeps the time option and AM/PM indicators", () => {
    expect(
      encodeEventNotes({ eventType: "Leave", timeOption: "full", startAmPm: "AM", endAmPm: "PM" }),
    ).toBe('{"eventType":"Leave","timeOption":"full","startAmPm":"AM","endAmPm":"PM"}');
  });

  it("drops the indicators for timed events", () => {
    expect(
      encodeEventNotes({
        eventType: "Leave",
        timeOption: "range",
        startAmPm: undefined,
        endAmPm: undefined,
      }),
    ).toBe('{"eventType":"Leave","timeOption":"range"}');
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

describe("withEditLink", () => {
  it("puts the Edit line above the JSON block", () => {
    expect(
      withEditLink('{"eventId":"g-1"}', "https://cal.example.com/dashboard?date=2026-08-18&edit=g-1"),
    ).toBe(
      'Edit: https://cal.example.com/dashboard?date=2026-08-18&edit=g-1\n\n{"eventId":"g-1"}',
    );
  });

  it("yields just the link line for an empty notes block", () => {
    expect(withEditLink("", "https://x")).toBe("Edit: https://x");
  });

  it("leaves the block untouched for an empty url", () => {
    expect(withEditLink('{"a":1}', "")).toBe('{"a":1}');
  });
});

describe("eventEditUrl", () => {
  it("builds the dashboard deep link from base url, start and event id", () => {
    expect(eventEditUrl("https://cal.example.com", "2026-08-18 09:00:00", "g-1")).toBe(
      "https://cal.example.com/dashboard?date=2026-08-18&edit=g-1",
    );
  });

  it("omits the date param when the start is empty", () => {
    expect(eventEditUrl("https://cal.example.com", "", "g-1")).toBe(
      "https://cal.example.com/dashboard?edit=g-1",
    );
  });
});

describe("parseEventNotes (edit-link format)", () => {
  it("parses the notes from the JSON line below the Edit line", () => {
    const editLink = "https://cal.example.com/dashboard?date=2026-08-18&edit=g-1";
    const description = withEditLink(
      encodeEventNotes({ eventId: "g-1", eventType: "Leave", title: "Team offsite", editLink }),
      editLink,
    );
    expect(parseEventNotes(description)).toEqual({
      eventId: "g-1",
      eventType: "Leave",
      title: "Team offsite",
      editLink,
    });
  });

  it("survives braces inside the title", () => {
    const description = withEditLink(
      encodeEventNotes({ eventId: "g-1", title: "fix } { it" }),
      "https://x",
    );
    const notes = parseEventNotes(description);
    expect(notes?.title).toBe("fix } { it");
    expect(notes?.eventId).toBe("g-1");
  });

  it("keeps the field-level parsers working", () => {
    const description = withEditLink(
      encodeEventNotes({ eventType: "Leave", createdBy: "u-1", inviteeUsers: ["u-2"] }),
      "https://x",
    );
    expect(parseEventType(description)).toBe("Leave");
    expect(parseEventPeople(description)).toEqual({
      eventId: null,
      creatorId: "u-1",
      userIds: ["u-2"],
      departmentIds: [],
    });
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

  it("returns an empty string for a deliberately blank title", () => {
    expect(parseEventTitle('{"title":""}')).toBe("");
  });

  it("returns null for legacy notes without a title", () => {
    expect(parseEventTitle("")).toBeNull();
    expect(parseEventTitle('{"eventType":"Leave"}')).toBeNull();
    expect(parseEventTitle("not json")).toBeNull();
  });
});

describe("parseEventTimeOption", () => {
  it("extracts a valid time option", () => {
    expect(parseEventTimeOption('{"timeOption":"full"}')).toBe("full");
    expect(parseEventTimeOption('{"timeOption":"range"}')).toBe("range");
  });

  it("returns null for absent, empty, invalid, or legacy values", () => {
    expect(parseEventTimeOption("")).toBeNull();
    expect(parseEventTimeOption('{"eventType":"Leave"}')).toBeNull();
    expect(parseEventTimeOption('{"timeOption":""}')).toBeNull();
    expect(parseEventTimeOption('{"timeOption":"half"}')).toBeNull();
    expect(parseEventTimeOption('{"timeOption":"ampm"}')).toBeNull();
  });
});

describe("parseEventStartAmPm / parseEventEndAmPm", () => {
  it("extracts AM or PM for each indicator", () => {
    expect(parseEventStartAmPm('{"startAmPm":"AM","endAmPm":"PM"}')).toBe("AM");
    expect(parseEventEndAmPm('{"startAmPm":"AM","endAmPm":"PM"}')).toBe("PM");
  });

  it("returns null for absent or invalid values", () => {
    expect(parseEventStartAmPm("")).toBeNull();
    expect(parseEventEndAmPm("")).toBeNull();
    expect(parseEventStartAmPm('{"timeOption":"full"}')).toBeNull();
    expect(parseEventEndAmPm('{"timeOption":"full"}')).toBeNull();
    expect(parseEventStartAmPm('{"startAmPm":"MIDDAY"}')).toBeNull();
    expect(parseEventEndAmPm('{"endAmPm":"MIDDAY"}')).toBeNull();
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
