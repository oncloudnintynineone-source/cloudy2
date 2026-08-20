import { describe, expect, it } from "vitest";

import { dayBounds, decodeAuditCursor, encodeAuditCursor, parseAuditFilters } from "./queries";

describe("parseAuditFilters", () => {
  it("parses all supported params", () => {
    const cursor = encodeAuditCursor({
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
      id: "22222222-2222-2222-2222-222222222222",
    });
    const filters = parseAuditFilters({
      actor: "Alice Tan",
      action: "user.create",
      entity: "user",
      q: "Bob",
      from: "2026-08-01",
      to: "2026-08-20",
      cursor,
    });
    expect(filters).toEqual({
      actor: "Alice Tan",
      action: "user.create",
      entityType: "user",
      query: "Bob",
      from: "2026-08-01",
      to: "2026-08-20",
      cursor,
    });
  });

  it("drops empty and malformed values", () => {
    const filters = parseAuditFilters({
      actor: "",
      action: " ",
      entity: undefined,
      q: undefined,
      from: "not-a-date",
      to: "2026-13-45",
      cursor: "%%%not-base64url%%%",
    });
    expect(filters).toEqual({
      actor: null,
      action: null,
      entityType: null,
      query: null,
      from: null,
      to: null,
      cursor: null,
    });
  });

  it("drops impossible calendar dates like 2026-02-31", () => {
    const filters = parseAuditFilters({ from: "2026-02-31" });
    expect(filters.from).toBeNull();
  });

  it("keeps a cursor only when it decodes", () => {
    const valid = encodeAuditCursor({
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
      id: "22222222-2222-2222-2222-222222222222",
    });
    const filters = parseAuditFilters({ cursor: valid });
    expect(filters.cursor).toBe(valid);
  });

  it("trims whitespace from text values", () => {
    const filters = parseAuditFilters({ actor: "  Alice Tan  ", q: "  Bob  " });
    expect(filters.actor).toBe("Alice Tan");
    expect(filters.query).toBe("Bob");
  });
});

describe("audit cursor", () => {
  it("round-trips through encode/decode", () => {
    const row = {
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
      id: "22222222-2222-2222-2222-222222222222",
    };
    const decoded = decodeAuditCursor(encodeAuditCursor(row));
    expect(decoded).toEqual({ createdAtMs: row.createdAt.getTime(), id: row.id });
  });

  it("returns null for absent or malformed cursors", () => {
    expect(decodeAuditCursor(null)).toBeNull();
    expect(decodeAuditCursor(undefined)).toBeNull();
    expect(decodeAuditCursor("")).toBeNull();
    expect(decodeAuditCursor("not base64url")).toBeNull();
    expect(decodeAuditCursor("{}")).toBeNull();
    expect(decodeAuditCursor('["nope", "id"]')).toBeNull();
  });

  it("produces URL-safe, padded-char-free output", () => {
    const cursor = encodeAuditCursor({
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
      id: "22222222-2222-2222-2222-222222222222",
    });
    expect(cursor).not.toMatch(/[+/=]/);
    expect(cursor.length).toBeGreaterThan(0);
  });
});

describe("dayBounds", () => {
  it("builds inclusive UTC bounds for from/to dates", () => {
    expect(dayBounds("2026-08-01", "2026-08-20")).toEqual({
      start: new Date("2026-08-01T00:00:00.000Z"),
      end: new Date("2026-08-20T23:59:59.999Z"),
    });
  });

  it("yields null bounds when either bound is absent", () => {
    expect(dayBounds(null, "2026-08-20")).toEqual({
      start: null,
      end: new Date("2026-08-20T23:59:59.999Z"),
    });
    expect(dayBounds("2026-08-01", null)).toEqual({
      start: new Date("2026-08-01T00:00:00.000Z"),
      end: null,
    });
    expect(dayBounds(null, null)).toEqual({ start: null, end: null });
  });
});
