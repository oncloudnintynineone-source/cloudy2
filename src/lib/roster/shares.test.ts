import { describe, expect, it } from "vitest";

import {
  diffAccess,
  diffRevocable,
  isDepartmentAccessRole,
  isInherentOwnerEmail,
  isValidEmail,
  needsAdminOwnerGrant,
} from "./shares";

describe("isValidEmail", () => {
  it("accepts a plain email", () => {
    expect(isValidEmail("alice@example.com")).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
});

describe("isDepartmentAccessRole", () => {
  it("accepts the three selectable roles", () => {
    expect(isDepartmentAccessRole("reader")).toBe(true);
    expect(isDepartmentAccessRole("writer")).toBe(true);
    expect(isDepartmentAccessRole("owner")).toBe(true);
  });

  it("rejects freeBusyReader and other values", () => {
    expect(isDepartmentAccessRole("freeBusyReader")).toBe(false);
    expect(isDepartmentAccessRole("")).toBe(false);
    expect(isDepartmentAccessRole(undefined)).toBe(false);
    expect(isDepartmentAccessRole("admin")).toBe(false);
  });
});

describe("diffAccess", () => {
  const existing = [
    { email: "alice@example.com", role: "reader" },
    { email: "bob@example.com", role: "reader" },
  ];

  it("returns expected emails that have no existing rule", () => {
    expect(diffAccess(existing, ["alice@example.com", "carol@example.com"])).toEqual([
      "carol@example.com",
    ]);
  });

  it("is case-insensitive against existing rules", () => {
    expect(diffAccess(existing, ["ALICE@example.com"])).toEqual([]);
  });

  it("returns empty when all expected emails already have access", () => {
    expect(diffAccess(existing, ["alice@example.com", "bob@example.com"])).toEqual([]);
  });

  it("ignores blank emails", () => {
    expect(diffAccess([], ["", "   ", "carol@example.com"])).toEqual(["carol@example.com"]);
  });
});

describe("diffRevocable", () => {
  it("returns candidates that no assigned user holds", () => {
    expect(diffRevocable(["alice@example.com"], ["alice.new@example.com"])).toEqual([
      "alice@example.com",
    ]);
  });

  it("keeps a candidate still held by an assigned user", () => {
    expect(diffRevocable(["alice@example.com"], ["alice@example.com"])).toEqual([]);
  });

  it("is case-insensitive against assigned emails", () => {
    expect(diffRevocable(["ALICE@example.com"], ["alice@example.com"])).toEqual([]);
  });

  it("ignores blank candidates", () => {
    expect(diffRevocable(["", "   "], ["alice@example.com"])).toEqual([]);
  });
});

describe("isInherentOwnerEmail", () => {
  it("is true for the calendar resource id, service account, and admin email", () => {
    expect(isInherentOwnerEmail("cal-id-1", "cal-id-1", "sa@x.com", "admin@x.com")).toBe(true);
    expect(isInherentOwnerEmail("sa@x.com", "cal-id-1", "sa@x.com", "admin@x.com")).toBe(true);
    expect(isInherentOwnerEmail("admin@x.com", "cal-id-1", "sa@x.com", "admin@x.com")).toBe(true);
  });

  it("is false for any other email", () => {
    expect(isInherentOwnerEmail("alice@example.com", "cal-id-1", "sa@x.com", "admin@x.com")).toBe(
      false,
    );
  });

  it("is false when the admin email is blank", () => {
    expect(isInherentOwnerEmail("", "cal-id-1", "sa@x.com", "")).toBe(false);
  });
});

describe("needsAdminOwnerGrant", () => {
  const acls = [
    { email: "alice@example.com", role: "reader" },
    { email: "admin@example.com", role: "owner" },
  ];

  it("is false when the admin already has an owner rule", () => {
    expect(needsAdminOwnerGrant(acls, "admin@example.com")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(needsAdminOwnerGrant(acls, "ADMIN@example.com")).toBe(false);
  });

  it("is true when the admin has no rule", () => {
    expect(needsAdminOwnerGrant(acls, "boss@example.com")).toBe(true);
  });

  it("is true when the admin only has a lower role (upgrade to owner)", () => {
    expect(
      needsAdminOwnerGrant(
        [{ email: "boss@example.com", role: "reader" }],
        "boss@example.com",
      ),
    ).toBe(true);
  });

  it("is false for a blank email", () => {
    expect(needsAdminOwnerGrant(acls, "")).toBe(false);
    expect(needsAdminOwnerGrant(acls, "   ")).toBe(false);
  });
});
