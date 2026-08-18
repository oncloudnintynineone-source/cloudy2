import { describe, expect, it } from "vitest";

import { isGroupUnfiltered, resolveFilterApply, type FilterApplyGroup } from "./resolveFilterApply";

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
