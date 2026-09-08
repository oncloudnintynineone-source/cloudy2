import { describe, expect, it } from "vitest";

import {
  INVITEE_DEPARTMENTS_SECTION,
  NO_DEPARTMENT_LABEL,
  buildUserGroups,
  departmentPickerOptions,
  filterPickerGroups,
  mergeInviteeSelection,
  optionMatchesQuery,
  selectionByGroup,
  sortOptionsInGroups,
  splitInvitees,
  toggleInviteeUser,
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
    expect(optionMatchesQuery({ id: "a", label: "Some Name", search: "short" }, "SHORT")).toBe(
      true,
    );
    expect(optionMatchesQuery({ id: "a", label: "Some Name", search: "short" }, "missing")).toBe(
      false,
    );
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
      {
        label: "Second",
        options: [
          { id: "b", label: "beta" },
          { id: "a", label: "Alpha" },
        ],
      },
      { label: "First", options: [{ id: "x", label: "zeta" }] },
    ];
    const sorted = sortOptionsInGroups(input);
    expect(sorted.map((g) => g.label)).toEqual(["Second", "First"]);
    expect(sorted[0].options.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("leaves department-row options (carrying a depth) in tree preorder", () => {
    const rows: PickerGroup = {
      label: "Departments",
      options: [
        { id: "log", label: "Zulu Logistics", depth: 1 },
        { id: "stores", label: "Alpha Stores", depth: 2 },
      ],
    };
    const sorted = sortOptionsInGroups([rows]);
    expect(sorted[0].options.map((o) => o.id)).toEqual(["log", "stores"]);
  });
});

/**
 * HQ (0)
 * ├── Logistics (1) — owns one user
 * │   └── Stores (2) — owns one user
 * └── Ops (3) — owns one user
 * Field (4) — owns one user
 */
const HIERARCHY_MEMBERS = [
  { id: "u-hq", label: "HQ User", department: "HQ", departmentId: "hq", departmentSort: 0, departmentParentId: null },
  { id: "u-log", label: "Log User", department: "Logistics", departmentId: "log", departmentSort: 1, departmentParentId: "hq" },
  { id: "u-stores", label: "Stores User", department: "Stores", departmentId: "stores", departmentSort: 2, departmentParentId: "log" },
  { id: "u-ops", label: "Ops User", department: "Ops", departmentId: "ops", departmentSort: 3, departmentParentId: "hq" },
  { id: "u-field", label: "Field User", department: "Field", departmentId: "field", departmentSort: 4, departmentParentId: null },
];

describe("buildUserGroups hierarchy nesting", () => {
  it("orders id-keyed sections by rank and tags each with its nesting depth", () => {
    const groups = buildUserGroups(HIERARCHY_MEMBERS);
    expect(groups.map((g) => [g.label, g.depth])).toEqual([
      ["HQ", 0],
      ["Logistics", 1],
      ["Stores", 2],
      ["Ops", 1],
      ["Field", 0],
    ]);
  });

  it("keeps the whole flat behavior (name keys, no depth) when ids are absent", () => {
    const groups = buildUserGroups([
      { id: "u1", label: "A", department: "Zulu" },
      { id: "u2", label: "B", department: "Alpha", departmentSort: 1 },
    ]);
    expect(groups.map((g) => [g.label, g.depth])).toEqual([
      ["Alpha", undefined],
      ["Zulu", undefined],
    ]);
  });

  it("drops a hidden ancestor from the depth chain (no floating indents)", () => {
    // Only the two children of HQ are present — HQ itself has no member here.
    const groups = buildUserGroups(HIERARCHY_MEMBERS.filter((u) => u.departmentId !== "hq"));
    expect(groups.map((g) => [g.label, g.depth])).toEqual([
      ["Logistics", 0],
      ["Stores", 1],
      ["Ops", 0],
      ["Field", 0],
    ]);
  });

  it("ignores a self-referential parent chain (cycle-safe)", () => {
    const groups = buildUserGroups([
      { id: "u1", label: "A", department: "Loop", departmentId: "loop", departmentSort: 0, departmentParentId: "loop" },
    ]);
    expect(groups.map((g) => [g.label, g.depth])).toEqual([["Loop", 0]]);
  });

  it("keeps No department flat at the end next to id-keyed sections", () => {
    const groups = buildUserGroups([
      ...HIERARCHY_MEMBERS,
      { id: "u-none", label: "Lone", department: null },
    ]);
    const last = groups[groups.length - 1];
    expect(last.label).toBe(NO_DEPARTMENT_LABEL);
    expect(last.depth).toBeUndefined();
  });
});

describe("departmentPickerOptions", () => {
  it("labels preorder department rows with their full ancestor chain", () => {
    const options = departmentPickerOptions([
      { id: "hq", name: "HQ", sortOrder: 0, parentId: null, depth: 0 },
      { id: "log", name: "Logistics", sortOrder: 1, parentId: "hq", depth: 1 },
      { id: "stores", name: "Stores", sortOrder: 2, parentId: "log", depth: 2 },
    ]);
    expect(options).toEqual([
      { id: "hq", label: "HQ", depth: 0 },
      { id: "log", label: "HQ › Logistics", depth: 1 },
      { id: "stores", label: "HQ › Logistics › Stores", depth: 2 },
    ]);
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

  it("orders sections by departmentSort ascending, breaking ties by name", () => {
    const groups = buildUserGroups([
      { id: "u1", label: "Zoe", department: "Alpha", departmentSort: 5 },
      { id: "u2", label: "Yan", department: "Beta", departmentSort: 1 },
      { id: "u3", label: "Xin", department: "Tie B", departmentSort: 3 },
      { id: "u4", label: "Wei", department: "Tie A", departmentSort: 3 },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Beta", "Tie A", "Tie B", "Alpha"]);
  });

  it("sorts sections without a departmentSort after the ranked ones, alphabetically", () => {
    const groups = buildUserGroups([
      { id: "u1", label: "Zoe", department: "Alpha", departmentSort: 2 },
      { id: "u2", label: "Yan", department: "Zulu" },
      { id: "u3", label: "Xin", department: "Mike" },
      { id: "u4", label: "Wei", department: "Beta", departmentSort: 1 },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Beta", "Alpha", "Mike", "Zulu"]);
  });

  it("keeps the unranked and No department sections after ranked ones", () => {
    const groups = buildUserGroups([
      { id: "u1", label: "Zoe", department: "Ops", departmentSort: 1 },
      { id: "u2", label: "Yan", department: null },
      { id: "u3", label: "Xin", department: "Adhoc" },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Ops", "Adhoc", NO_DEPARTMENT_LABEL]);
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

describe("splitInvitees", () => {
  it("splits prefixed values into user and department ids", () => {
    expect(splitInvitees(["user:u1", "dept:d1", "user:u2"])).toEqual({
      userIds: ["u1", "u2"],
      departmentIds: ["d1"],
    });
  });

  it("returns empty lists for an empty input", () => {
    expect(splitInvitees([])).toEqual({ userIds: [], departmentIds: [] });
  });

  it("ignores malformed entries", () => {
    expect(splitInvitees(["u1", "dept:", "user:"])).toEqual({ userIds: [""], departmentIds: [""] });
  });
});

describe("mergeInviteeSelection", () => {
  const GROUPS_WITH_DEPTS: PickerGroup[] = [
    {
      label: INVITEE_DEPARTMENTS_SECTION,
      options: [
        { id: "d1", label: "Dept 1" },
        { id: "d2", label: "Dept 2" },
      ],
    },
    {
      label: "Engineering",
      options: [
        { id: "u1", label: "Alice" },
        { id: "u2", label: "Bob" },
      ],
    },
    { label: "Admin", options: [{ id: "u3", label: "Carol" }] },
  ];

  it("removes a deselected user while keeping others", () => {
    const previous = ["user:u1", "user:u2", "user:u3"];
    const draft = {
      [INVITEE_DEPARTMENTS_SECTION]: [] as string[],
      Engineering: ["u1"], // u2 deselected
      Admin: ["u3"],
    };
    expect(mergeInviteeSelection(GROUPS_WITH_DEPTS, previous, draft)).toEqual([
      "user:u1",
      "user:u3",
    ]);
  });

  it("removes a deselected department", () => {
    const previous = ["dept:d1", "dept:d2", "user:u1"];
    const draft = {
      [INVITEE_DEPARTMENTS_SECTION]: ["d1"], // d2 deselected
      Engineering: ["u1"],
      Admin: [] as string[],
    };
    expect(mergeInviteeSelection(GROUPS_WITH_DEPTS, previous, draft)).toEqual([
      "dept:d1",
      "user:u1",
    ]);
  });

  it("preserves inactive ids that no longer appear in picker groups", () => {
    const previous = ["user:ghost", "dept:ghostDept", "user:u1"];
    const draft = {
      [INVITEE_DEPARTMENTS_SECTION]: [] as string[],
      Engineering: ["u1"],
      Admin: [] as string[],
    };
    const result = mergeInviteeSelection(GROUPS_WITH_DEPTS, previous, draft);
    expect(result).toEqual(["dept:ghostDept", "user:u1", "user:ghost"]);
  });

  it("honors deselecting the organizer — nothing is auto-re-added", () => {
    const previous = ["user:u1", "user:u2"];
    const draft = {
      [INVITEE_DEPARTMENTS_SECTION]: [] as string[],
      Engineering: ["u1"], // u2 (organizer) deselected
      Admin: [] as string[],
    };
    expect(mergeInviteeSelection(GROUPS_WITH_DEPTS, previous, draft)).toEqual(["user:u1"]);
  });

  it("deselect-all visible leaves only inactive ids", () => {
    const previous = ["user:u1", "user:ghost", "dept:d1"];
    const draft = {
      [INVITEE_DEPARTMENTS_SECTION]: [] as string[],
      Engineering: [] as string[],
      Admin: [] as string[],
    };
    expect(mergeInviteeSelection(GROUPS_WITH_DEPTS, previous, draft)).toEqual(["user:ghost"]);
  });

  it("adds newly selected users and departments", () => {
    const previous: string[] = [];
    const draft = {
      [INVITEE_DEPARTMENTS_SECTION]: ["d2"],
      Engineering: ["u2"],
      Admin: ["u3"],
    };
    expect(mergeInviteeSelection(GROUPS_WITH_DEPTS, previous, draft)).toEqual([
      "dept:d2",
      "user:u2",
      "user:u3",
    ]);
  });
});

describe("toggleInviteeUser", () => {
  it("appends the user entry when absent", () => {
    expect(toggleInviteeUser(["user:u1", "dept:d1"], "u2")).toEqual([
      "user:u1",
      "dept:d1",
      "user:u2",
    ]);
  });

  it("appends to an empty list", () => {
    expect(toggleInviteeUser([], "u1")).toEqual(["user:u1"]);
  });

  it("removes the user entry when present", () => {
    expect(toggleInviteeUser(["user:u1", "dept:d1", "user:u2"], "u1")).toEqual([
      "dept:d1",
      "user:u2",
    ]);
  });

  it("leaves departments and other users untouched when removing", () => {
    expect(toggleInviteeUser(["dept:d1", "user:u1", "user:u2"], "u2")).toEqual([
      "dept:d1",
      "user:u1",
    ]);
  });

  it("returns a new array", () => {
    const input = ["user:u1"];
    expect(toggleInviteeUser(input, "u1")).not.toBe(input);
    expect(toggleInviteeUser(input, "u2")).not.toBe(input);
  });
});
