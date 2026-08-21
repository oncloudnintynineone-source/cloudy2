import { describe, expect, it } from "vitest";

import {
  actionLabel,
  EMPTY_VALUE,
  fieldLabel,
  formatAuditDetails,
  formatLogTimestamp,
  valueString,
} from "./format";

describe("actionLabel", () => {
  it("maps known actions to human-readable labels", () => {
    expect(actionLabel("user.create")).toBe("User created");
    expect(actionLabel("event.update")).toBe("Event updated");
    expect(actionLabel("auth.login.failure")).toBe("Login failed");
    expect(actionLabel("audit.purge")).toBe("Audit log purged");
  });

  it("prettifies unknown actions as a fallback", () => {
    expect(actionLabel("report.generate")).toBe("Report Generate");
  });
});

describe("fieldLabel", () => {
  it("maps known fields to labels", () => {
    expect(fieldLabel("phone")).toBe("Phone");
    expect(fieldLabel("departmentId")).toBe("Department");
    expect(fieldLabel("outOfCamp")).toBe("Out of camp");
    expect(fieldLabel("userKeyword")).toBe("Login keyword");
  });

  it("falls back to the raw key for unknown fields", () => {
    expect(fieldLabel("someFutureField")).toBe("someFutureField");
  });
});

describe("valueString", () => {
  it("renders null/undefined as the empty marker", () => {
    expect(valueString("anything", null)).toBe(EMPTY_VALUE);
    expect(valueString("anything", undefined)).toBe(EMPTY_VALUE);
  });

  it("renders booleans as Yes/No", () => {
    expect(valueString("outOfCamp", true)).toBe("Yes");
    expect(valueString("outOfCamp", false)).toBe("No");
  });

  it("joins string arrays", () => {
    expect(valueString("invitees", ["Tan Wei Liang", "Lim Kah"])).toBe("Tan Wei Liang, Lim Kah");
    expect(valueString("invitees", [])).toBe("");
  });

  it("maps time option and location policy enums to labels", () => {
    expect(valueString("timeOption", "range")).toBe("Start & End");
    expect(valueString("timeOption", "full")).toBe("Full Day");
    expect(valueString("timeOptions", ["range", "full"])).toBe("Start & End, Full Day");
    expect(valueString("locationPolicy", "out")).toBe("Out of camp only");
  });

  it("leaves unknown enum values untouched", () => {
    expect(valueString("timeOption", "bogus")).toBe("bogus");
  });

  it("serializes other values with JSON", () => {
    expect(valueString("count", 3)).toBe("3");
    expect(valueString("nested", { a: 1 })).toBe('{"a":1}');
  });
});

describe("formatAuditDetails", () => {
  it("renders a FieldDiff as change lines, context values, and the resulting state", () => {
    const result = formatAuditDetails({
      before: { name: "Old", phone: "8111" },
      after: { name: "New", phone: "8111" },
      changes: { name: ["Old", "New"] },
      eventId: "abc-123",
    });
    expect(result.kind).toBe("changes");
    expect(result.lines).toEqual([{ label: "Name", before: "Old", after: "New" }]);
    expect(result.values).toEqual([{ label: "Event ID", value: "abc-123" }]);
    expect(result.after).toEqual([
      { label: "Name", value: "New" },
      { label: "Phone", value: "8111" },
    ]);
  });

  it("renders flat objects as label/value lines", () => {
    const result = formatAuditDetails({
      title: "Trip",
      outOfCamp: true,
      location: null,
      departments: ["COU", "LOG"],
      inviteeUserCount: 2,
    });
    expect(result.kind).toBe("fields");
    expect(result.lines).toEqual([]);
    expect(result.values).toEqual([
      { label: "Title", value: "Trip" },
      { label: "Out of camp", value: "Yes" },
      { label: "Location", value: EMPTY_VALUE },
      { label: "Departments", value: "COU, LOG" },
      { label: "Invitee users (count)", value: "2" },
    ]);
  });

  it("renders a legacy event.create row with labels and mapped enums", () => {
    const result = formatAuditDetails({
      eventId: "7905a65b",
      eventType: "Out of Camp",
      timeOption: "range",
      outOfCamp: true,
      location: "Singapore",
      targetCalendarIds: ["46829e20"],
      targetCalendars: ["COU"],
      inviteeUserCount: 1,
      googleEventIds: ["o0qgnnv2"],
    });
    expect(result.kind).toBe("fields");
    expect(result.values).toEqual([
      { label: "Event ID", value: "7905a65b" },
      { label: "Type", value: "Out of Camp" },
      { label: "Time option", value: "Start & End" },
      { label: "Out of camp", value: "Yes" },
      { label: "Location", value: "Singapore" },
      { label: "Calendar IDs", value: "46829e20" },
      { label: "Calendars", value: "COU" },
      { label: "Invitee users (count)", value: "1" },
      { label: "Google event IDs", value: "o0qgnnv2" },
    ]);
  });

  it("renders an empty diff with no lines as a changes entry", () => {
    const result = formatAuditDetails({
      before: { name: "Same" },
      after: { name: "Same" },
      changes: {},
    });
    expect(result.kind).toBe("changes");
    expect(result.lines).toEqual([]);
    expect(result.values).toEqual([]);
    expect(result.after).toEqual([{ label: "Name", value: "Same" }]);
  });

  it("serializes non-flat details as pretty JSON", () => {
    const result = formatAuditDetails({ reason: "invalid_credentials" });
    expect(result.kind).toBe("fields");
    expect(result.values).toEqual([{ label: "Reason", value: "invalid_credentials" }]);
    expect(result.json).toBeNull();

    const nested = formatAuditDetails({ nested: { a: 1 } });
    expect(nested.kind).toBe("json");
    expect(nested.json).toContain('"a": 1');
  });

  it("handles null details", () => {
    const result = formatAuditDetails(null);
    expect(result.kind).toBe("json");
    expect(result.lines).toEqual([]);
    expect(result.values).toEqual([]);
    expect(result.json).toBe("null");
  });
});

describe("formatLogTimestamp", () => {
  it("renders Asia/Singapore wall clock (UTC+8) from a UTC instant", () => {
    expect(formatLogTimestamp(new Date("2026-08-01T10:30:00.000Z"))).toBe("2026-08-01 18:30");
  });

  it("pads month, day, hour, and minute", () => {
    expect(formatLogTimestamp(new Date("2026-01-05T01:05:00.000Z"))).toBe("2026-01-05 09:05");
  });
});
