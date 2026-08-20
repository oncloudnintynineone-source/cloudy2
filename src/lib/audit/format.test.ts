import { describe, expect, it } from "vitest";

import { actionLabel, formatAuditDetails, formatLogTimestamp } from "./format";

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

describe("formatAuditDetails", () => {
  it("renders a FieldDiff as before/after lines", () => {
    const result = formatAuditDetails({
      before: { name: "Old" },
      after: { name: "New" },
      changes: { name: ["Old", "New"] },
    });
    expect(result.kind).toBe("changes");
    expect(result.lines).toEqual([{ label: "name", before: "Old", after: "New" }]);
  });

  it("serializes non-diff details as pretty JSON", () => {
    const result = formatAuditDetails({ reason: "invalid_credentials" });
    expect(result.kind).toBe("json");
    expect(result.lines).toEqual([]);
    expect(result.json).toContain('"invalid_credentials"');
  });

  it("handles null details", () => {
    const result = formatAuditDetails(null);
    expect(result.kind).toBe("json");
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
