import { describe, expect, it } from "vitest";

import {
  addableDepartmentIds,
  grantSummaryLabel,
  isAccessRole,
  nextGrantsAfterAdd,
  removeGrant,
  resolveOwnRolePatch,
  setGrantRole,
  sortGrantsByTreeOrder,
} from "./accessEditor";
import type { UserCalendarGrant } from "./shares";

/** Department-tree order: hq › logistics, hq › stores, field. */
const ORDER = ["hq", "logistics", "stores", "field"];

function grant(calendarId: string, role: UserCalendarGrant["role"] = "reader"): UserCalendarGrant {
  return { calendarId, role };
}

describe("isAccessRole", () => {
  it("accepts the three selectable levels", () => {
    expect(isAccessRole("reader")).toBe(true);
    expect(isAccessRole("writer")).toBe(true);
    expect(isAccessRole("owner")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isAccessRole("freeBusyReader")).toBe(false);
    expect(isAccessRole(null)).toBe(false);
    expect(isAccessRole(undefined)).toBe(false);
  });
});

describe("addableDepartmentIds", () => {
  it("offers every department except the user's own and the staged ones", () => {
    expect(addableDepartmentIds(ORDER, "hq", [grant("stores")])).toEqual(["logistics", "field"]);
  });

  it("offers everything when nothing is staged and there is no department", () => {
    expect(addableDepartmentIds(ORDER, null, [])).toEqual(ORDER);
  });
});

describe("sortGrantsByTreeOrder", () => {
  it("orders rows by the department tree", () => {
    expect(
      sortGrantsByTreeOrder([grant("field"), grant("logistics")], ORDER).map((g) => g.calendarId),
    ).toEqual(["logistics", "field"]);
  });

  it("keeps unknown departments last in their existing order", () => {
    const sorted = sortGrantsByTreeOrder([grant("ghost2"), grant("hq"), grant("ghost1")], ORDER);
    expect(sorted.map((g) => g.calendarId)).toEqual(["hq", "ghost2", "ghost1"]);
  });
});

describe("nextGrantsAfterAdd", () => {
  it("adds new rows as reader in tree order", () => {
    const next = nextGrantsAfterAdd([], ["field", "logistics"], ORDER);
    expect(next).toEqual([grant("logistics"), grant("field")]);
  });

  it("keeps an existing row's level and never duplicates it", () => {
    const next = nextGrantsAfterAdd([grant("logistics", "owner")], ["logistics", "field"], ORDER);
    expect(next).toEqual([grant("logistics", "owner"), grant("field")]);
  });

  it("leaves a deleted department's row where it was (still last)", () => {
    const next = nextGrantsAfterAdd([grant("ghost")], ["hq"], ORDER);
    expect(next.map((g) => g.calendarId)).toEqual(["hq", "ghost"]);
  });
});

describe("setGrantRole / removeGrant", () => {
  it("changes only the targeted row", () => {
    const next = setGrantRole([grant("hq"), grant("field")], "field", "writer");
    expect(next).toEqual([grant("hq"), grant("field", "writer")]);
  });

  it("ignores an unknown row", () => {
    const rows = [grant("hq")];
    expect(setGrantRole(rows, "gone", "writer")).toEqual(rows);
    expect(removeGrant(rows, "gone")).toEqual(rows);
  });

  it("drops the targeted row", () => {
    expect(removeGrant([grant("hq"), grant("field")], "hq")).toEqual([grant("field")]);
  });
});

describe("resolveOwnRolePatch", () => {
  it("sends nothing when the row was left alone", () => {
    expect(
      resolveOwnRolePatch({
        seededRole: "reader",
        stagedRole: null,
        hasEmail: true,
        departmentChanged: false,
      }),
    ).toBeNull();
  });

  it("sends nothing when the pick matches the live level", () => {
    expect(
      resolveOwnRolePatch({
        seededRole: "writer",
        stagedRole: "writer",
        hasEmail: true,
        departmentChanged: false,
      }),
    ).toBeNull();
  });

  it("sends nothing without an email to grant to", () => {
    expect(
      resolveOwnRolePatch({
        seededRole: null,
        stagedRole: "writer",
        hasEmail: false,
        departmentChanged: false,
      }),
    ).toBeNull();
  });

  it("sends an explicit pick that differs from the live level", () => {
    expect(
      resolveOwnRolePatch({
        seededRole: "reader",
        stagedRole: "owner",
        hasEmail: true,
        departmentChanged: false,
      }),
    ).toBe("owner");
  });

  it("applies an explicit pick when the live level could not be read", () => {
    expect(
      resolveOwnRolePatch({
        seededRole: null,
        stagedRole: "reader",
        hasEmail: true,
        departmentChanged: false,
      }),
    ).toBe("reader");
  });

  it("treats any pick as a change after a department change", () => {
    expect(
      resolveOwnRolePatch({
        seededRole: "writer",
        stagedRole: "writer",
        hasEmail: true,
        departmentChanged: true,
      }),
    ).toBe("writer");
    expect(
      resolveOwnRolePatch({
        seededRole: "writer",
        stagedRole: null,
        hasEmail: true,
        departmentChanged: true,
      }),
    ).toBeNull();
  });
});

describe("grantSummaryLabel", () => {
  it("singularizes one grant", () => {
    expect(grantSummaryLabel(1)).toBe("1 department");
    expect(grantSummaryLabel(0)).toBe("0 departments");
    expect(grantSummaryLabel(3)).toBe("3 departments");
  });
});
