import { describe, expect, it } from "vitest";

import { canChangeLock, modifyGuard, type EventModifyTarget, type GuardSession } from "./guards";

const admin: GuardSession = { user: { id: "admin-1", role: "admin" } };
const alice: GuardSession = { user: { id: "alice", role: "user" } };
const bob: GuardSession = { user: { id: "bob", role: "user" } };

/** Active members per department: cal-1 → alice+bob, cal-2 → bob. */
const memberships = new Map<string, ReadonlyArray<string>>([
  ["cal-1", ["alice", "bob"]],
  ["cal-2", ["bob"]],
]);

function target(overrides: Partial<EventModifyTarget> = {}): EventModifyTarget {
  return {
    creatorId: null,
    inviteeUserIds: [],
    inviteeDepartmentIds: [],
    ownerOnlyEdits: false,
    ...overrides,
  };
}

describe("modifyGuard", () => {
  it("allows admins to modify any event, ignoring the owner-only lock", () => {
    expect(modifyGuard(admin, target({ creatorId: "alice" }))).toBeNull();
    expect(
      modifyGuard(admin, target({ creatorId: "alice", ownerOnlyEdits: true })),
    ).toBeNull();
    expect(modifyGuard(admin, target({}))).toBeNull();
  });

  it("allows the organizer to modify their own event", () => {
    expect(modifyGuard(alice, target({ creatorId: "alice" }))).toBeNull();
  });

  it("allows the organizer to modify even when the owner-only lock is on", () => {
    expect(
      modifyGuard(alice, target({ creatorId: "alice", ownerOnlyEdits: true })),
    ).toBeNull();
  });

  it("blocks everyone else when the organizer locked the event", () => {
    const locked = target({ creatorId: "alice", ownerOnlyEdits: true });
    expect(modifyGuard(bob, locked, memberships)).toBe(
      "Only the organizer can edit this event",
    );
    expect(modifyGuard(bob, { ...locked, inviteeUserIds: ["bob"] }, memberships)).toBe(
      "Only the organizer can edit this event",
    );
    // Admins bypass the lock.
    expect(modifyGuard(admin, locked)).toBeNull();
  });

  it("allows an individually tagged attendee to edit", () => {
    const event = target({ creatorId: "alice", inviteeUserIds: ["bob"] });
    expect(modifyGuard(bob, event, memberships)).toBeNull();
  });

  it("allows an active member of a tagged department to edit", () => {
    const event = target({ creatorId: "alice", inviteeDepartmentIds: ["cal-1"] });
    expect(modifyGuard(alice, event, memberships)).toBeNull();
    expect(modifyGuard(bob, event, memberships)).toBeNull();
    expect(modifyGuard(bob, target({ creatorId: "alice", inviteeDepartmentIds: ["cal-2"] }), memberships)).toBeNull();
  });

  it("rejects someone who is neither organizer, attendee, nor tagged-department member", () => {
    const event = target({ creatorId: "alice" });
    expect(modifyGuard(bob, event, memberships)).toBe("You can only edit or delete events you're on");
    const event2 = target({ creatorId: "alice", inviteeDepartmentIds: ["cal-2"] });
    expect(modifyGuard({ user: { id: "carol", role: "user" } }, event2, memberships)).toBe(
      "You can only edit or delete events you're on",
    );
  });

  it("resolves department membership from the roster only (unknown departments deny)", () => {
    const event = target({ creatorId: "alice", inviteeDepartmentIds: ["cal-9"] });
    expect(modifyGuard(bob, event, memberships)).toBe("You can only edit or delete events you're on");
  });

  it("keeps creator-less, people-less events (legacy/external) admin-only", () => {
    const empty = target({});
    expect(modifyGuard(alice, empty, memberships)).toBe(
      "You can only edit or delete events you created",
    );
    expect(modifyGuard(admin, empty, memberships)).toBeNull();
  });
});

describe("canChangeLock", () => {
  it("lets the organizer or an admin toggle the lock", () => {
    expect(canChangeLock(alice, "alice")).toBe(true);
    expect(canChangeLock(admin, "alice")).toBe(true);
  });

  it("blocks everyone else", () => {
    expect(canChangeLock(bob, "alice")).toBe(false);
    expect(canChangeLock(alice, null)).toBe(false);
  });
});
