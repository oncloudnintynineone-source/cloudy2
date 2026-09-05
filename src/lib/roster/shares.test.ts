import { describe, expect, it } from "vitest";

import {
  diffAccess,
  diffRevocable,
  formatManagedGrants,
  isDepartmentAccessRole,
  isInherentOwnerEmail,
  isManagedGrantRole,
  isValidEmail,
  needsAdminOwnerGrant,
  needsManagedGrant,
  normalizeAccessSelection,
  normalizeGrantRole,
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
      needsAdminOwnerGrant([{ email: "boss@example.com", role: "reader" }], "boss@example.com"),
    ).toBe(true);
  });

  it("is false for a blank email", () => {
    expect(needsAdminOwnerGrant(acls, "")).toBe(false);
    expect(needsAdminOwnerGrant(acls, "   ")).toBe(false);
  });
});

describe("isManagedGrantRole", () => {
  it("accepts reader, writer, and owner", () => {
    expect(isManagedGrantRole("reader")).toBe(true);
    expect(isManagedGrantRole("writer")).toBe(true);
    expect(isManagedGrantRole("owner")).toBe(true);
  });

  it("rejects freeBusyReader and other values", () => {
    expect(isManagedGrantRole("freeBusyReader")).toBe(false);
    expect(isManagedGrantRole("")).toBe(false);
    expect(isManagedGrantRole(undefined)).toBe(false);
  });
});

describe("normalizeGrantRole", () => {
  it("keeps owner and writer and falls back to reader otherwise", () => {
    expect(normalizeGrantRole("owner")).toBe("owner");
    expect(normalizeGrantRole("writer")).toBe("writer");
    expect(normalizeGrantRole("reader")).toBe("reader");
    expect(normalizeGrantRole("freeBusyReader")).toBe("reader");
    expect(normalizeGrantRole(null)).toBe("reader");
    expect(normalizeGrantRole(undefined)).toBe("reader");
    expect(normalizeGrantRole("")).toBe("reader");
  });
});

describe("needsManagedGrant", () => {
  it("is true when there is no rule", () => {
    expect(needsManagedGrant(null, "reader")).toBe(true);
    expect(needsManagedGrant(undefined, "writer")).toBe(true);
    expect(needsManagedGrant("", "reader")).toBe(true);
  });

  it("is true when the rule sits below the intended role", () => {
    expect(needsManagedGrant("reader", "writer")).toBe(true);
    expect(needsManagedGrant("reader", "owner")).toBe(true);
    expect(needsManagedGrant("writer", "owner")).toBe(true);
  });

  it("is false when the rule meets or exceeds the intended role", () => {
    expect(needsManagedGrant("reader", "reader")).toBe(false);
    expect(needsManagedGrant("writer", "writer")).toBe(false);
    expect(needsManagedGrant("writer", "reader")).toBe(false);
    expect(needsManagedGrant("owner", "writer")).toBe(false);
    expect(needsManagedGrant("owner", "owner")).toBe(false);
  });
});

describe("normalizeAccessSelection", () => {
  it("keeps reader/writer/owner roles and trims calendar ids", () => {
    expect(
      normalizeAccessSelection(
        [
          { calendarId: " a ", role: "reader" },
          { calendarId: "b", role: "writer" },
          { calendarId: "c", role: "owner" },
        ],
        null,
      ),
    ).toEqual([
      { calendarId: "a", role: "reader" },
      { calendarId: "b", role: "writer" },
      { calendarId: "c", role: "owner" },
    ]);
  });

  it("drops invalid roles, blank ids, non-objects, and duplicates", () => {
    expect(
      normalizeAccessSelection(
        [
          { calendarId: "a", role: "freeBusyReader" },
          { calendarId: "", role: "reader" },
          { calendarId: "a", role: "writer" },
          null,
          "nope",
          { calendarId: undefined, role: "reader" },
        ],
        null,
      ),
    ).toEqual([{ calendarId: "a", role: "reader" }]);
  });

  it("excludes the user's own department", () => {
    expect(
      normalizeAccessSelection(
        [{ calendarId: "own", role: "writer" }, { calendarId: "other" }],
        "own",
      ),
    ).toEqual([{ calendarId: "other", role: "reader" }]);
  });

  it("returns an empty list for non-array input", () => {
    expect(normalizeAccessSelection(undefined, null)).toEqual([]);
    expect(normalizeAccessSelection(null, null)).toEqual([]);
    expect(normalizeAccessSelection("a", null)).toEqual([]);
  });
});

describe("formatManagedGrants", () => {
  const names: Record<string, string> = { ops: "Operations", log: "Logistics" };

  it("renders department + role labels, sorted by department name", () => {
    expect(
      formatManagedGrants(
        [
          { calendarId: "log", role: "reader" },
          { calendarId: "ops", role: "writer" },
        ],
        names,
      ),
    ).toEqual(["Logistics (Read only)", "Operations (Can edit)"]);
  });

  it("labels an owner grant", () => {
    expect(formatManagedGrants([{ calendarId: "ops", role: "owner" }], names)).toEqual([
      "Operations (Owner)",
    ]);
  });

  it("falls back to the calendar id when the name is unknown", () => {
    expect(formatManagedGrants([{ calendarId: "mystery", role: "writer" }], names)).toEqual([
      "mystery (Can edit)",
    ]);
  });
});
