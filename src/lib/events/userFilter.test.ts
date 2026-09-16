import { describe, expect, it } from "vitest";

import { eventMatchesUserFilter } from "./userFilter";

const noDepts: string[] = [];

describe("eventMatchesUserFilter", () => {
  it("does not match merely because the user created the event (must be an attendee)", () => {
    expect(
      eventMatchesUserFilter(
        { creatorId: "alice", inviteeUserIds: [], inviteeDepartmentIds: noDepts },
        ["alice"],
      ),
    ).toBe(false);
  });

  it("matches when the selected user is tagged", () => {
    expect(
      eventMatchesUserFilter(
        { creatorId: "bob", inviteeUserIds: ["bob", "alice"], inviteeDepartmentIds: noDepts },
        ["alice"],
      ),
    ).toBe(true);
  });

  it("matches a self-invited organizer", () => {
    expect(
      eventMatchesUserFilter(
        { creatorId: "alice", inviteeUserIds: ["alice", "bob"], inviteeDepartmentIds: noDepts },
        ["alice"],
      ),
    ).toBe(true);
  });

  it("matches on any of several selected users", () => {
    expect(
      eventMatchesUserFilter(
        { creatorId: "carol", inviteeUserIds: ["alice", "dave"], inviteeDepartmentIds: noDepts },
        ["bob", "alice", "erin"],
      ),
    ).toBe(true);
  });

  it("does not match when no selected user is creator or tagged", () => {
    expect(
      eventMatchesUserFilter(
        { creatorId: "bob", inviteeUserIds: ["carol"], inviteeDepartmentIds: noDepts },
        ["alice", "dave"],
      ),
    ).toBe(false);
  });

  it("does not match events with no people at all", () => {
    expect(
      eventMatchesUserFilter(
        { creatorId: null, inviteeUserIds: [], inviteeDepartmentIds: noDepts },
        ["alice"],
      ),
    ).toBe(false);
  });

  it("never returns true for an empty selection (caller skips the filter then)", () => {
    expect(
      eventMatchesUserFilter(
        { creatorId: "alice", inviteeUserIds: ["bob"], inviteeDepartmentIds: noDepts },
        [],
      ),
    ).toBe(false);
  });

  it("ignores duplicate ids on either side", () => {
    expect(
      eventMatchesUserFilter(
        { creatorId: "alice", inviteeUserIds: ["alice", "alice"], inviteeDepartmentIds: noDepts },
        ["alice", "alice"],
      ),
    ).toBe(true);
  });

  it("matches an active member of a tagged department", () => {
    expect(
      eventMatchesUserFilter(
        { creatorId: "bob", inviteeUserIds: [], inviteeDepartmentIds: ["cal-1"] },
        ["alice"],
        new Map([["cal-1", ["alice", "carol"]]]),
      ),
    ).toBe(true);
  });

  it("matches on any of several tagged departments", () => {
    expect(
      eventMatchesUserFilter(
        { creatorId: "bob", inviteeUserIds: [], inviteeDepartmentIds: ["cal-1", "cal-2"] },
        ["alice"],
        new Map([
          ["cal-1", ["carol"]],
          ["cal-2", ["alice"]],
        ]),
      ),
    ).toBe(true);
  });

  it("does not match when the tagged department's members exclude the selection", () => {
    expect(
      eventMatchesUserFilter(
        { creatorId: "bob", inviteeUserIds: [], inviteeDepartmentIds: ["cal-1"] },
        ["alice"],
        new Map([["cal-1", ["carol"]]]),
      ),
    ).toBe(false);
  });

  it("does not match a selected user in a different department", () => {
    expect(
      eventMatchesUserFilter(
        { creatorId: "bob", inviteeUserIds: [], inviteeDepartmentIds: ["cal-1"] },
        ["alice"],
        new Map([
          ["cal-1", ["carol"]],
          ["cal-2", ["alice"]],
        ]),
      ),
    ).toBe(false);
  });

  it("falls back to attendee-only matching when no memberships map is given", () => {
    expect(
      eventMatchesUserFilter(
        { creatorId: "bob", inviteeUserIds: [], inviteeDepartmentIds: ["cal-1"] },
        ["alice"],
      ),
    ).toBe(false);
  });
});
