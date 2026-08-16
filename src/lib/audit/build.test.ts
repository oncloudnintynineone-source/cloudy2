import { describe, expect, it } from "vitest";

import { actorFromUser, AUDIT_ACTIONS, buildAuditLog, pathFromReferer } from "./build";
import { diffFields } from "./diff";

describe("buildAuditLog", () => {
  it("maps a complete input to insert values", () => {
    const row = buildAuditLog({
      actorId: "11111111-1111-1111-1111-111111111111",
      actorName: "Alice Tan",
      actorRole: "admin",
      action: AUDIT_ACTIONS.userCreate,
      entityType: "user",
      entityId: "22222222-2222-2222-2222-222222222222",
      entityName: "Bob Lim",
      method: "createUser",
      route: "/roster",
      details: { name: "Bob Lim" },
      ip: "1.2.3.4",
    });

    expect(row).toMatchObject({
      actorId: "11111111-1111-1111-1111-111111111111",
      actorName: "Alice Tan",
      actorRole: "admin",
      action: "user.create",
      entityType: "user",
      entityId: "22222222-2222-2222-2222-222222222222",
      entityName: "Bob Lim",
      method: "createUser",
      route: "/roster",
      details: { name: "Bob Lim" },
      ip: "1.2.3.4",
    });
  });

  it("defaults optional fields to null", () => {
    const row = buildAuditLog({
      actorId: null,
      actorName: null,
      actorRole: null,
      action: AUDIT_ACTIONS.authLoginFailure,
      method: "credentials.authorize",
    });

    expect(row).toMatchObject({
      actorId: null,
      actorName: null,
      actorRole: null,
      action: "auth.login.failure",
      entityType: null,
      entityId: null,
      entityName: null,
      method: "credentials.authorize",
      details: null,
      route: null,
      ip: null,
    });
  });

  it("accepts a FieldDiff as details", () => {
    const row = buildAuditLog({
      actorId: null,
      actorName: null,
      actorRole: null,
      action: AUDIT_ACTIONS.userUpdate,
      details: diffFields({ name: "Old" }, { name: "New" }),
    });
    expect(row.details).toEqual({
      before: { name: "Old" },
      after: { name: "New" },
      changes: { name: ["Old", "New"] },
    });
  });
});

describe("actorFromUser", () => {
  it("maps a real user id to an actor id", () => {
    expect(actorFromUser({ id: "abc-123", name: "Alice", role: "user" })).toEqual({
      actorId: "abc-123",
      actorName: "Alice",
      actorRole: "user",
    });
  });

  it("maps the admin pseudo-account to a null actor id", () => {
    expect(actorFromUser({ id: "admin", name: "Admin", role: "admin" })).toEqual({
      actorId: null,
      actorName: "Admin",
      actorRole: "admin",
    });
  });

  it("falls back to null name", () => {
    expect(actorFromUser({ id: "abc", name: null, role: "user" })).toEqual({
      actorId: "abc",
      actorName: null,
      actorRole: "user",
    });
  });
});

describe("pathFromReferer", () => {
  it("extracts the pathname from a full URL", () => {
    expect(pathFromReferer("https://cloudy.app/roster")).toBe("/roster");
  });

  it("keeps query strings off the path", () => {
    expect(pathFromReferer("http://localhost:3000/departments?page=2")).toBe("/departments");
  });

  it("returns null for empty or malformed referers", () => {
    expect(pathFromReferer(null)).toBeNull();
    expect(pathFromReferer(undefined)).toBeNull();
    expect(pathFromReferer("not a url")).toBeNull();
  });
});
