import { describe, expect, it } from "vitest";

import { scopeParadeUsers, type ParadeUserScope } from "./scopeUsers";

const CIU = "ciu";
const COU = "cou";

function user(id: string, departmentId: string | null): ParadeUserScope {
  return { id, department: departmentId ? { id: departmentId, name: departmentId } : null };
}

const USERS: ParadeUserScope[] = [
  user("a1", CIU),
  user("a2", CIU),
  user("b1", COU),
  user("na", null),
];
const ALL = [CIU, COU];

describe("scopeParadeUsers", () => {
  it("shows everyone, including unassigned, when all calendars are selected", () => {
    expect(scopeParadeUsers(USERS, ALL, ALL, [])).toEqual(USERS);
  });

  it("treats an empty calendar selection as no narrowing", () => {
    expect(scopeParadeUsers(USERS, ALL, [], [])).toEqual(USERS);
  });

  it("narrows to the selected departments and hides the unassigned group on a proper subset", () => {
    expect(scopeParadeUsers(USERS, ALL, [CIU], [])).toEqual([USERS[0], USERS[1]]);
  });

  it("keeps only the selected users when there is no calendar narrowing", () => {
    expect(scopeParadeUsers(USERS, ALL, ALL, ["na", "b1"])).toEqual([USERS[2], USERS[3]]);
  });

  it("intersects the user filter with the calendar narrowing", () => {
    expect(scopeParadeUsers(USERS, ALL, [CIU], ["a2", "b1"])).toEqual([USERS[1]]);
  });

  it("returns nothing when the user filter matches no roster user", () => {
    expect(scopeParadeUsers(USERS, ALL, [], ["ghost"])).toEqual([]);
  });

  it("preserves roster order regardless of the selected ids' order", () => {
    expect(scopeParadeUsers(USERS, ALL, [], ["b1", "a2", "a1"])).toEqual([
      USERS[0],
      USERS[1],
      USERS[2],
    ]);
  });
});
