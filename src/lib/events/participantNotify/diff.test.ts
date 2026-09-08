import { describe, expect, it } from "vitest";

import { computeAddedUserIds, occupiedUserIds, type DepartmentMemberships } from "./diff";

const memberships: DepartmentMemberships = new Map([
  ["dept-a", ["u-a1", "u-a2", "u-a3"]],
  ["dept-b", ["u-b1", "u-b2"]],
]);

describe("occupiedUserIds", () => {
  it("occupies tagged users plus every member of a tagged department", () => {
    expect(
      occupiedUserIds(
        { inviteeUserIds: ["u-x", "u-a1"], inviteeDepartments: ["dept-a"] },
        memberships,
      ),
    ).toEqual(new Set(["u-x", "u-a1", "u-a2", "u-a3"]));
  });

  it("occupies nothing for a null/empty people set", () => {
    expect(occupiedUserIds(null, memberships)).toEqual(new Set());
    expect(
      occupiedUserIds({ inviteeUserIds: [], inviteeDepartments: [] }, memberships),
    ).toEqual(new Set());
  });

  it("drops malformed entries and unknown departments", () => {
    // Deliberately malformed (non-string invitee entry) to exercise the pure
    // coerce path — typed through unknown so TS doesn't block the robustness
    // case we are testing.
    const people = {
      inviteeUserIds: ["u-ok", 5, ""],
      inviteeDepartments: ["missing-dept", "dept-b"],
    } as unknown as Parameters<typeof occupiedUserIds>[0];
    expect(occupiedUserIds(people, memberships)).toEqual(new Set(["u-ok", "u-b1", "u-b2"]));
  });
});

describe("computeAddedUserIds", () => {
  it("adds everyone on a fresh create (no before state)", () => {
    const added = computeAddedUserIds(
      null,
      { inviteeUserIds: ["u-a1"], inviteeDepartments: ["dept-a"] },
      memberships,
    );
    expect(added).toEqual(["u-a1", "u-a2", "u-a3"]);
  });

  it("reports only the newly tagged user on an edit", () => {
    const added = computeAddedUserIds(
      { inviteeUserIds: ["u-a1", "u-b1"], inviteeDepartments: [] },
      { inviteeUserIds: ["u-a1", "u-b1", "u-c"], inviteeDepartments: [] },
      memberships,
    );
    expect(added).toEqual(["u-c"]);
  });

  it("reports a newly tagged department's members", () => {
    const added = computeAddedUserIds(
      { inviteeUserIds: [], inviteeDepartments: ["dept-a"] },
      { inviteeUserIds: [], inviteeDepartments: ["dept-a", "dept-b"] },
      memberships,
    );
    expect(added).toEqual(["u-b1", "u-b2"]);
  });

  it("a no-op edit adds nobody", () => {
    const people = { inviteeUserIds: ["u-a1", "u-b1"], inviteeDepartments: ["dept-b"] };
    expect(computeAddedUserIds(people, people, memberships)).toEqual([]);
  });

  it("a time/location-only edit adds nobody", () => {
    const before = { inviteeUserIds: ["u-a1"], inviteeDepartments: ["dept-a"] };
    const after = { ...before };
    expect(computeAddedUserIds(before, after, memberships)).toEqual([]);
  });

  it("removing then re-adding a user re-reports them", () => {
    const added = computeAddedUserIds(
      { inviteeUserIds: ["u-a1", "u-a2"], inviteeDepartments: [] },
      { inviteeUserIds: ["u-a1", "u-a3"], inviteeDepartments: [] },
      memberships,
    );
    expect(added).toEqual(["u-a3"]);
  });

  it("does not re-report members of a department that was already tagged", () => {
    const before = { inviteeUserIds: [], inviteeDepartments: ["dept-a"] };
    const after = { inviteeUserIds: [], inviteeDepartments: ["dept-a"] };
    const laterMemberships: DepartmentMemberships = new Map([
      ["dept-a", ["u-a1", "u-a2", "u-a3", "u-new"]],
    ]);
    // Both states are resolved against the same (current) roster snapshot, so a
    // member who joined after the department was first tagged is not treated as
    // "added" by a later edit — an already-tagged department's members are
    // never re-notified on subsequent edits.
    expect(computeAddedUserIds(before, after, laterMemberships)).toEqual([]);
  });

  it("keeps deterministic ordering: tagged users first, then department members", () => {
    const added = computeAddedUserIds(
      null,
      { inviteeUserIds: ["u-z"], inviteeDepartments: ["dept-a", "dept-b"] },
      memberships,
    );
    expect(added).toEqual(["u-z", "u-a1", "u-a2", "u-a3", "u-b1", "u-b2"]);
  });
});
