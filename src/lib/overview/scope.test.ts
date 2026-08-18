import { describe, expect, it } from "vitest";

import type { UserStatus } from "@/lib/roster/validate";
import { overviewRowUserIds, type OverviewRowUser } from "./scope";

const CIU = "ciu";
const COU = "cou";

function user(id: string, departmentId: string | null, status: UserStatus = "active"): OverviewRowUser {
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

describe("overviewRowUserIds", () => {
  it("gives a non-admin their own department by default", () => {
    const ids = overviewRowUserIds({
      users: USERS,
      selectedCalendarIds: [CIU],
      calendarCount: 2,
      isAdmin: false,
    });
    expect(ids).toEqual(["a1", "a2"]);
  });

  it("gives a non-admin the other department's users when filtered to it", () => {
    const ids = overviewRowUserIds({
      users: USERS,
      selectedCalendarIds: [COU],
      calendarCount: 2,
      isAdmin: false,
    });
    expect(ids).toEqual(["b1", "b2"]);
  });

  it("gives a non-admin every selected department when all are selected", () => {
    // Regression guard: selecting all calendars must not collapse to the role
    // default (own department) — rows follow the selected departments.
    const ids = overviewRowUserIds({
      users: USERS,
      selectedCalendarIds: [CIU, COU],
      calendarCount: 2,
      isAdmin: false,
    });
    expect(ids).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("ignores users entirely — rows depend only on calendars and role", () => {
    // The users filter deliberately has no input here (it narrows events in
    // `fetchMonthEvents`); this pins the contract that cross-department +
    // own-user selection can no longer intersect rows to empty.
    const withOwnUserSelected = overviewRowUserIds({
      users: USERS,
      selectedCalendarIds: [COU],
      calendarCount: 2,
      isAdmin: false,
    });
    expect(withOwnUserSelected).toEqual(["b1", "b2"]);
  });

  it("gives admins every active user (incl. unassigned) by default", () => {
    // The default view is an explicit full selection from the helper's
    // perspective — same code path, so unassigned users stay visible for
    // admins either way.
    const ids = overviewRowUserIds({
      users: USERS,
      selectedCalendarIds: [CIU, COU],
      calendarCount: 2,
      isAdmin: true,
    });
    expect(ids).toEqual(["a1", "a2", "b1", "b2", "na"]);
  });

  it("always excludes inactive users", () => {
    const ids = overviewRowUserIds({
      users: USERS,
      selectedCalendarIds: [CIU, COU],
      calendarCount: 2,
      isAdmin: true,
    });
    expect(ids).not.toContain("off");
  });

  it("returns nothing for a non-admin without a department and no calendars", () => {
    const ids = overviewRowUserIds({
      users: USERS,
      selectedCalendarIds: [],
      calendarCount: 2,
      isAdmin: false,
    });
    expect(ids).toEqual([]);
  });
});
