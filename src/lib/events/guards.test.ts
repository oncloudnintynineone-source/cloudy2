import { describe, expect, it } from "vitest";

import { creatorGuard, ownershipGuard, type GuardSession } from "./guards";

const admin: GuardSession = { user: { id: "admin-1", role: "admin" } };
const alice: GuardSession = { user: { id: "alice", role: "user" } };

describe("creatorGuard", () => {
  it("allows admins to act on behalf of anyone", () => {
    expect(creatorGuard(admin, "someone-else", null)).toBeNull();
    expect(creatorGuard(admin, "alice", "bob")).toBeNull();
  });

  it("allows a user to create/edit for themselves", () => {
    expect(creatorGuard(alice, "alice", null)).toBeNull();
    expect(creatorGuard(alice, "alice", "alice")).toBeNull();
  });

  it("allows keeping the original creator on edit", () => {
    expect(creatorGuard(alice, "bob", "bob")).toBeNull();
  });

  it("rejects introducing a different creator on create", () => {
    expect(creatorGuard(alice, "bob", null)).toBe(
      "You can only create or edit events for yourself",
    );
  });

  it("rejects changing the creator on edit", () => {
    expect(creatorGuard(alice, "bob", "carol")).toBe(
      "You can only create or edit events for yourself",
    );
  });
});

describe("ownershipGuard", () => {
  it("allows admins to edit/delete any event", () => {
    expect(ownershipGuard(admin, null)).toBeNull();
    expect(ownershipGuard(admin, "alice")).toBeNull();
  });

  it("allows a user to edit/delete their own events", () => {
    expect(ownershipGuard(alice, "alice")).toBeNull();
  });

  it("rejects editing/deleting someone else's event", () => {
    expect(ownershipGuard(alice, "bob")).toBe("You can only edit or delete your own events");
  });

  it("rejects editing/deleting events with no recorded creator", () => {
    expect(ownershipGuard(alice, null)).toBe("You can only edit or delete your own events");
  });
});
