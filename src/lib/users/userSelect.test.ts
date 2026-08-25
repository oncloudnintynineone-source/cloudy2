import { describe, expect, it } from "vitest";

import {
  NO_DEPARTMENT_LABEL,
  buildUserGroups,
  filterPickerGroups,
  optionMatchesQuery,
  selectionByGroup,
  sortOptionsInGroups,
  type PickerGroup,
} from "./userSelect";

const GROUPS: PickerGroup[] = [
  {
    label: "Logistics",
    options: [
      { id: "u3", label: "Tan Wei Ming" },
      { id: "u1", label: "Ahmad Faiz", search: "faiz" },
    ],
  },
  {
    label: "Admin",
    options: [{ id: "u2", label: "Chng Ai Ling" }],
  },
];

describe("optionMatchesQuery", () => {
  it("matches the label case-insensitively", () => {
    expect(optionMatchesQuery({ id: "a", label: "Tan Wei Ming" }, "tan wei")).toBe(true);
    expect(optionMatchesQuery({ id: "a", label: "Tan Wei Ming" }, "WEI ming")).toBe(true);
    expect(optionMatchesQuery({ id: "a", label: "Tan Wei Ming" }, "tan wong")).toBe(false);
  });

  it("matches the extra search terms", () => {
    expect(optionMatchesQuery({ id: "a", label: "Some Name", search: "short" }, "SHORT")).toBe(true);
    expect(optionMatchesQuery({ id: "a", label: "Some Name", search: "short" }, "missing")).toBe(false);
  });

  it("treats an empty or whitespace query as matching everything", () => {
    expect(optionMatchesQuery({ id: "a", label: "x" }, "")).toBe(true);
    expect(optionMatchesQuery({ id: "a", label: "x" }, "   ")).toBe(true);
  });

  it("trims surrounding whitespace from the query", () => {
    expect(optionMatchesQuery({ id: "a", label: "Tan Wei Ming" }, "  tan  ")).toBe(true);
  });
});

describe("sortOptionsInGroups", () => {
  it("sorts options by label case-insensitively without reordering sections", () => {
    const input: PickerGroup[] = [
      { label: "Second", options: [{ id: "b", label: "beta" }, { id: "a", label: "Alpha" }] },
      { label: "First", options: [{ id: "x", label: "zeta" }] },
    ];
    const sorted = sortOptionsInGroups(input);
    expect(sorted.map((g) => g.label)).toEqual(["Second", "First"]);
    expect(sorted[0].options.map((o) => o.id)).toEqual(["a", "b"]);
  });
});

describe("buildUserGroups", () => {
  it("groups by department, sorts sections and options, keeps No department last", () => {
    const groups = buildUserGroups([
      { id: "u3", label: "Tan Wei Ming", department: "Logistics" },
      { id: "u4", label: "Wong Koon", department: null },
      { id: "u1", label: "Ahmad Faiz", department: "Logistics" },
      { id: "u2", label: "Chng Ai Ling", department: "Admin" },
      { id: "u5", label: "Lim Boon", department: "" },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Admin", "Logistics", NO_DEPARTMENT_LABEL]);
    expect(groups[1].options.map((o) => o.id)).toEqual(["u1", "u3"]);
    expect(groups[2].options.map((o) => o.id)).toEqual(["u5", "u4"]);
  });

  it("returns no sections for an empty roster", () => {
    expect(buildUserGroups([])).toEqual([]);
  });

  it("omits the No department section when every user has a department", () => {
    const groups = buildUserGroups([{ id: "u1", label: "A", department: "Admin" }]);
    expect(groups.map((g) => g.label)).toEqual(["Admin"]);
  });
});

describe("filterPickerGroups", () => {
  it("returns the groups untouched for a blank query", () => {
    expect(filterPickerGroups(GROUPS, "")).toBe(GROUPS);
    expect(filterPickerGroups(GROUPS, "   ")).toBe(GROUPS);
  });

  it("keeps matching options and drops emptied sections", () => {
    const visible = filterPickerGroups(GROUPS, "tan");
    expect(visible.map((g) => g.label)).toEqual(["Logistics"]);
    expect(visible[0].options.map((o) => o.id)).toEqual(["u3"]);
  });

  it("keeps a whole section when the section label matches", () => {
    const visible = filterPickerGroups(GROUPS, "logi");
    expect(visible.map((g) => g.label)).toEqual(["Logistics"]);
    expect(visible[0].options.map((o) => o.id)).toEqual(["u3", "u1"]);
  });

  it("matches options across several sections in one pass", () => {
    const visible = filterPickerGroups(GROUPS, "ling");
    expect(visible.map((g) => g.label)).toEqual(["Admin"]);
    const cross = filterPickerGroups(
      [
        { label: "A", options: [{ id: "1", label: "Foo Bar" }] },
        { label: "B", options: [{ id: "2", label: "Baz bar", search: "bar" }] },
      ],
      "bar",
    );
    expect(cross.map((g) => g.label)).toEqual(["A", "B"]);
  });

  it("returns no sections when nothing matches", () => {
    expect(filterPickerGroups(GROUPS, "zzz")).toEqual([]);
  });
});

describe("selectionByGroup", () => {
  it("maps each section to its selected ids in section order", () => {
    const selection = selectionByGroup(GROUPS, ["u1", "u2", "u3"]);
    expect(selection).toEqual({ Logistics: ["u3", "u1"], Admin: ["u2"] });
  });

  it("ignores ids that belong to no section", () => {
    expect(selectionByGroup(GROUPS, ["ghost"])).toEqual({ Logistics: [], Admin: [] });
  });

  it("returns empty lists per section for an empty selection", () => {
    expect(selectionByGroup(GROUPS, [])).toEqual({ Logistics: [], Admin: [] });
  });
});
