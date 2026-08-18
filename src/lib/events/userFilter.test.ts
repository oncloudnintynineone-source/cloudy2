import { describe, expect, it } from "vitest";

import { eventMatchesUserFilter } from "./userFilter";

describe("eventMatchesUserFilter", () => {
  it("matches when the selected user created the event", () => {
    expect(eventMatchesUserFilter({ creatorId: "alice", inviteeUserIds: [] }, ["alice"])).toBe(
      true,
    );
  });

  it("matches when the selected user is tagged", () => {
    expect(
      eventMatchesUserFilter({ creatorId: "bob", inviteeUserIds: ["bob", "alice"] }, ["alice"]),
    ).toBe(true);
  });

  it("matches on any of several selected users (creator or tagged)", () => {
    expect(
      eventMatchesUserFilter(
        { creatorId: "carol", inviteeUserIds: ["alice", "dave"] },
        ["bob", "alice", "erin"],
      ),
    ).toBe(true);
  });

  it("does not match when no selected user is creator or tagged", () => {
    expect(
      eventMatchesUserFilter({ creatorId: "bob", inviteeUserIds: ["carol"] }, ["alice", "dave"]),
    ).toBe(false);
  });

  it("does not match events with no people at all", () => {
    expect(eventMatchesUserFilter({ creatorId: null, inviteeUserIds: [] }, ["alice"])).toBe(
      false,
    );
  });

  it("never returns true for an empty selection (caller skips the filter then)", () => {
    expect(eventMatchesUserFilter({ creatorId: "alice", inviteeUserIds: ["bob"] }, [])).toBe(
      false,
    );
  });

  it("ignores duplicate ids on either side", () => {
    expect(
      eventMatchesUserFilter({ creatorId: "alice", inviteeUserIds: ["alice", "alice"] }, [
        "alice",
        "alice",
      ]),
    ).toBe(true);
  });
});
