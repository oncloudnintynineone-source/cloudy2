import { describe, expect, it } from "vitest";

import {
  describeFilterGroups,
  groupFilterState,
  isGroupUnfiltered,
  resolveFilterApply,
  type FilterApplyGroup,
} from "./resolveFilterApply";

const groups: FilterApplyGroup[] = [
  { label: "Calendars", optionCount: 3 },
  { label: "Users", optionCount: 3, variant: "search" },
  { label: "Event Types", optionCount: 2 },
];

const CAL_A = "cal-a";
const CAL_B = "cal-b";
const CAL_C = "cal-c";

describe("isGroupUnfiltered", () => {
  it("grid: all selected means no filter", () => {
    expect(isGroupUnfiltered(groups[0], [CAL_A, CAL_B, CAL_C])).toBe(true);
  });

  it("grid: a subset is a real filter", () => {
    expect(isGroupUnfiltered(groups[0], [CAL_A, CAL_B])).toBe(false);
  });

  it("search: empty selection means no filter", () => {
    expect(isGroupUnfiltered(groups[1], [])).toBe(true);
  });

  it("search: selecting every option means no filter", () => {
    expect(isGroupUnfiltered(groups[1], ["u1", "u2", "u3"])).toBe(true);
  });

  it("search: a subset is a real filter", () => {
    expect(isGroupUnfiltered(groups[1], ["u1", "u2"])).toBe(false);
  });
});

describe("resolveFilterApply", () => {
  it("untouched grid groups re-apply their current applied values", () => {
    const values = { Calendars: [CAL_A], Users: [], "Event Types": [] };
    const draft = { Calendars: [CAL_A, CAL_B, CAL_C], Users: [], "Event Types": ["t1", "t2"] };
    expect(resolveFilterApply(groups, draft, values, new Set(), false)).toEqual(values);
  });

  it("untouched groups keep an existing filter when Apply is re-pressed", () => {
    const values = { Calendars: [CAL_A, CAL_B], Users: ["u1"], "Event Types": ["t1"] };
    const draft = { Calendars: [CAL_A, CAL_B], Users: ["u1"], "Event Types": ["t1"] };
    expect(resolveFilterApply(groups, draft, values, new Set(), false)).toEqual(values);
  });

  it("changed grid groups apply their draft subset", () => {
    const values = { Calendars: [CAL_A, CAL_B, CAL_C], Users: [], "Event Types": [] };
    const draft = { Calendars: [CAL_B, CAL_C], Users: [], "Event Types": ["t1", "t2"] };
    expect(
      resolveFilterApply(groups, draft, values, new Set(["Calendars"]), false),
    ).toEqual({
      Calendars: [CAL_B, CAL_C],
      Users: [],
      "Event Types": [],
    });
  });

  it("changed grid groups keep a full selection instead of collapsing it (non-admin 'all calendars')", () => {
    const values = { Calendars: [CAL_A], Users: [], "Event Types": [] };
    const draft = { Calendars: [CAL_A, CAL_B, CAL_C], Users: [], "Event Types": ["t1", "t2"] };
    expect(
      resolveFilterApply(groups, draft, values, new Set(["Calendars"]), false),
    ).toEqual({
      Calendars: [CAL_A, CAL_B, CAL_C],
      Users: [],
      "Event Types": [],
    });
  });

  it("search groups keep empty (or fully selected) as no filter", () => {
    const draft = { Calendars: [CAL_A, CAL_B, CAL_C], Users: ["u1", "u2", "u3"], "Event Types": ["t1"] };
    expect(
      resolveFilterApply(groups, draft, { Calendars: [], Users: [], "Event Types": [] }, new Set(["Users"]), false),
    ).toEqual({ Calendars: [], Users: [], "Event Types": [] });
  });

  it("search groups pass a subset through", () => {
    const draft = { Calendars: [CAL_A, CAL_B, CAL_C], Users: ["u1", "u2"], "Event Types": ["t1"] };
    expect(
      resolveFilterApply(groups, draft, { Calendars: [], Users: [], "Event Types": [] }, new Set(["Users"]), false),
    ).toEqual({ Calendars: [], Users: ["u1", "u2"], "Event Types": [] });
  });

  it("Clear empties every grid group, restoring the consumer default", () => {
    const values = { Calendars: [CAL_A], Users: ["u1"], "Event Types": ["t1"] };
    const draft = { Calendars: [CAL_A, CAL_B, CAL_C], Users: [], "Event Types": ["t1", "t2"] };
    expect(
      resolveFilterApply(groups, draft, values, new Set(["Calendars", "Event Types"]), true),
    ).toEqual({ Calendars: [], Users: [], "Event Types": [] });
  });
});

describe("option-set awareness (optionValues)", () => {
  const usersGroup: FilterApplyGroup = {
    label: "Users",
    optionCount: 3,
    variant: "search",
    optionValues: ["u1", "u2", "u3"],
  };
  const calendarsGroup: FilterApplyGroup = {
    label: "Calendars",
    optionCount: 3,
    optionValues: [CAL_A, CAL_B, CAL_C],
  };

  it("search: exactly the listed options is still no filter", () => {
    expect(isGroupUnfiltered(usersGroup, ["u1", "u2", "u3"])).toBe(true);
    expect(groupFilterState(usersGroup, ["u1", "u2", "u3"]).kind).toBe("all");
  });

  it("search: a selection that also names an unlisted id is NOT 'all'", () => {
    // Regression: the option list can shrink under an applied pick (a deactivated
    // user, a filtered-out option list). The old count-only test read that as
    // "everything selected" and silently dropped the filter on Apply.
    expect(isGroupUnfiltered(usersGroup, ["u1", "u2", "u3", "gone"])).toBe(false);
    expect(
      resolveFilterApply(
        [usersGroup],
        { Users: ["u1", "u2", "u3", "gone"] },
        { Users: ["u1", "u2", "u3", "gone"] },
        new Set(),
        false,
      ),
    ).toEqual({ Users: ["u1", "u2", "u3", "gone"] });
  });

  it("search: an orphaned pick keeps the group active with a visible count", () => {
    expect(groupFilterState(usersGroup, ["u1", "u2", "gone"])).toEqual({
      kind: "some",
      label: "2 of 3",
      active: true,
      count: 2,
    });
  });

  it("search: a selection with nothing listed reads as None, never All", () => {
    expect(groupFilterState(usersGroup, ["gone"])).toEqual({
      kind: "none",
      label: "None",
      active: true,
      count: 0,
    });
  });

  it("grid: the set comparison replaces the count test when options are known", () => {
    expect(isGroupUnfiltered(calendarsGroup, [CAL_A, CAL_B, CAL_C])).toBe(true);
    expect(isGroupUnfiltered(calendarsGroup, [CAL_A, CAL_B])).toBe(false);
    // A full-count selection naming an id outside the option set is not "all".
    expect(isGroupUnfiltered(calendarsGroup, [CAL_A, CAL_B, "gone"])).toBe(false);
    expect(groupFilterState(calendarsGroup, [CAL_A, CAL_B, "gone"]).label).toBe("2 of 3");
  });

  it("describeFilterGroups agrees with the set-aware state", () => {
    expect(describeFilterGroups([usersGroup], { Users: ["u1", "u2", "gone"] })).toEqual([
      "2 users",
    ]);
  });
});

describe("groupFilterState", () => {
  it("grid: a full selection reads as All and is not an active filter", () => {
    expect(groupFilterState(groups[0], [CAL_A, CAL_B, CAL_C])).toEqual({
      kind: "all",
      label: "All",
      active: false,
      count: 3,
    });
  });

  it("grid: a subset counts against the group", () => {
    expect(groupFilterState(groups[0], [CAL_A, CAL_B])).toEqual({
      kind: "some",
      label: "2 of 3",
      active: true,
      count: 2,
    });
  });

  it("grid: an empty selection is the explicit None state", () => {
    expect(groupFilterState(groups[0], [])).toEqual({
      kind: "none",
      label: "None",
      active: true,
      count: 0,
    });
  });

  it("search: empty and full both mean All (no filter)", () => {
    expect(groupFilterState(groups[1], []).kind).toBe("all");
    expect(groupFilterState(groups[1], ["u1", "u2", "u3"]).kind).toBe("all");
    expect(groupFilterState(groups[1], ["u1"]).label).toBe("1 of 3");
  });

  it("clamps a stale-longer selection to the group's option count", () => {
    expect(groupFilterState(groups[2], ["t1", "t2", "gone"]).count).toBe(2);
  });

  it("treats a group with no options as All", () => {
    expect(groupFilterState({ optionCount: 0 }, []).kind).toBe("all");
  });
});

describe("describeFilterGroups", () => {
  it("names every group's state in plain words", () => {
    expect(
      describeFilterGroups(groups, {
        Calendars: [CAL_A, CAL_B, CAL_C],
        Users: ["u1", "u2"],
        "Event Types": ["t1"],
      }),
    ).toEqual(["All calendars", "2 users", "1 event type"]);
  });

  it("says No <group> for an explicit empty grid selection", () => {
    expect(describeFilterGroups([groups[0]], { Calendars: [] })).toEqual(["No calendars"]);
  });

  it("keeps an already-plural group label plural", () => {
    expect(
      describeFilterGroups([{ label: "Entity types", optionCount: 4 }], {
        "Entity types": ["a", "b"],
      }),
    ).toEqual(["2 entity types"]);
  });

  it("does not reduce a label that merely ends in s", () => {
    expect(describeFilterGroups([{ label: "Status", optionCount: 4 }], { Status: ["a"] })).toEqual([
      "1 status",
    ]);
  });

  it("appends the trimmed free-text term when present", () => {
    expect(
      describeFilterGroups([groups[0]], { Calendars: [] }, { label: "Event name", value: "  parade " }),
    ).toEqual(["No calendars", 'Event name "parade"']);
  });

  it("omits a blank free-text term", () => {
    expect(
      describeFilterGroups([groups[0]], { Calendars: [] }, { label: "Event name", value: "   " }),
    ).toEqual(["No calendars"]);
  });
});
