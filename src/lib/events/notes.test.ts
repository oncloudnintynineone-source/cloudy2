import { describe, expect, it } from "vitest";

import { encodeEventNotes, parseEventNotes, parseEventType } from "./notes";

describe("encodeEventNotes", () => {
  it("serializes a non-empty notes object as JSON", () => {
    expect(encodeEventNotes({ eventType: "Leave" })).toBe('{"eventType":"Leave"}');
  });

  it("drops empty values", () => {
    expect(encodeEventNotes({ eventType: "" })).toBe("");
    expect(encodeEventNotes({})).toBe("");
  });

  it("keeps future extra fields", () => {
    expect(encodeEventNotes({ eventType: "Leave", kahGroup: "G1" })).toBe(
      '{"eventType":"Leave","kahGroup":"G1"}',
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
