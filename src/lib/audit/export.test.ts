import { describe, expect, it } from "vitest";

import type { AuditLog } from "@/db/schema";

import { auditCsvFilename, buildAuditLogCsv, csvField } from "./export";

function row(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    actorId: "22222222-2222-2222-2222-222222222222",
    actorName: "Alice Tan",
    actorRole: "admin",
    action: "user.create",
    entityType: "user",
    entityId: "33333333-3333-3333-3333-333333333333",
    entityName: "Bob Lim",
    route: "/settings/users",
    method: "createUser",
    details: { name: "Bob Lim" },
    ip: "1.2.3.4",
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    ...overrides,
  };
}

describe("csvField", () => {
  it("passes plain text through unquoted", () => {
    expect(csvField("hello")).toBe("hello");
  });

  it("passes numbers through", () => {
    expect(csvField(42)).toBe("42");
  });

  it("serializes objects to JSON and quotes+escapes them", () => {
    expect(csvField({ a: 1 })).toBe('"{""a"":1}"');
  });

  it("renders null/undefined as an empty field", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("quotes fields containing commas, quotes, or newlines", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("buildAuditLogCsv", () => {
  it("emits a header line followed by one line per row", () => {
    const csv = buildAuditLogCsv([row(), row({ action: "event.delete", details: null })]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "created_at,actor,actor_role,action,entity_type,entity_id,entity_name,route,method,ip,details",
    );
    expect(lines).toHaveLength(3);
  });

  it("serializes createdAt as ISO and details as escaped JSON", () => {
    const csv = buildAuditLogCsv([row()]);
    const line = csv.split("\n")[1];
    expect(line).toContain("2026-08-01T10:00:00.000Z");
    expect(line).toContain('"{""name"":""Bob Lim""}"');
  });

  it("quotes a value that contains a comma", () => {
    const csv = buildAuditLogCsv([row({ actorName: "Tan, Alice" })]);
    expect(csv.split("\n")[1]).toContain('"Tan, Alice"');
  });
});

describe("auditCsvFilename", () => {
  it("formats the date into the filename", () => {
    expect(auditCsvFilename(new Date("2026-08-20T00:00:00.000Z"))).toBe("audit-log-2026-08-20.csv");
  });
});
