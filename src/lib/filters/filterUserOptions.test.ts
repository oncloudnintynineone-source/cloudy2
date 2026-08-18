import { describe, expect, it } from "vitest";

import type { UserStatus } from "@/lib/roster/validate";
import { filterUserOptionIds, type FilterUserSource } from "./filterUserOptions";

const CIU = "ciu";
const COU = "cou";

function user(id: string, departmentId: string | null, status: UserStatus = "active"): FilterUserSource {
  return { id, status, department: departmentId ? { id: departmentId } : null };
}

const USERS = [
  user("a1", CIU),
  user("a2", CIU),
  user("b1", COU),
  user("b2", COU),
  user("na", null),
  user("off", CIU, "inactive"),
];

describe("filterUserOptionIds", () => {
  it("returns the row ids as-is when the current user is already among them", () => {
    const ids = filterUserOptionIds({
      users: USERS,
      rowUserIds: ["a1", "a2"],
      currentUserId: "a1",
    });
    expect(ids).toEqual(["a1", "a2"]);
  });

  it("appends the current user when in the roster but not among the row ids", () => {
    const ids = filterUserOptionIds({
      users: USERS,
      rowUserIds: ["b1", "b2"],
      currentUserId: "a1",
    });
    expect(ids).toEqual(["b1", "b2", "a1"]);
  });

  it("does not add the current user when not in the roster (e.g. admin session id)", () => {
    const ids = filterUserOptionIds({
      users: USERS,
      rowUserIds: ["a1", "a2"],
      currentUserId: "admin",
    });
    expect(ids).toEqual(["a1", "a2"]);
  });

  it("keeps the current user even when inactive", () => {
    const ids = filterUserOptionIds({
      users: USERS,
      rowUserIds: ["b1"],
      currentUserId: "off",
    });
    expect(ids).toEqual(["b1", "off"]);
  });

  it("returns only the current user when the row set is empty", () => {
    const ids = filterUserOptionIds({
      users: USERS,
      rowUserIds: [],
      currentUserId: "na",
    });
    expect(ids).toEqual(["na"]);
  });

  it("does not append the current user a second time when already present", () => {
    const ids = filterUserOptionIds({
      users: USERS,
      rowUserIds: ["a1"],
      currentUserId: "a1",
    });
    expect(ids).toEqual(["a1"]);
  });
});
