import { describe, expect, it } from "vitest";

import {
  INVITEE_DEPARTMENTS_SECTION,
  NO_DEPARTMENT_LABEL,
  buildUserGroups,
  filterPickerGroups,
  mergeInviteeSelection,
  optionMatchesQuery,
  selectionByGroup,
  sortOptionsInGroups,
  splitInvitees,
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
    { label: INVITEE_DEPARTMENTS_SECTION, options: [{ id: "d1", label: "Dept 1" }, { id: "d2", label: "Dept 2" }] },
    { label: "Engineering", options: [{ id: "u1", label: "Alice" }, { id: "u2", label: "Bob" }] },
    { label: "Admin", options: [{ id: "u3", label: "Carol" }] },
  ];

  it("removes a deselected user while keeping others", () => {
    const previous = ["user:u1", "user:u2", "user:u3"];
    const draft = {
      [INVITEE_DEPARTMENTS_SECTION]: [] as string[],
      Engineering: ["u1"], // u2 deselected
      Admin: ["u3"],
    };
    expect(mergeInviteeSelection(GROUPS_WITH_DEPTS, previous, draft, null)).toEqual(["user:u1", "user:u3"]);
  });

  it("removes a deselected department", () => {
    const previous = ["dept:d1", "dept:d2", "user:u1"];
    const draft = {
      [INVITEE_DEPARTMENTS_SECTION]: ["d1"], // d2 deselected
      Engineering: ["u1"],
      Admin: [] as string[],
    };
    expect(mergeInviteeSelection(GROUPS_WITH_DEPTS, previous, draft, null)).toEqual(["dept:d1", "user:u1"]);
  });

  it("preserves inactive ids that no longer appear in picker groups", () => {
    const previous = ["user:ghost", "dept:ghostDept", "user:u1"];
    const draft = {
      [INVITEE_DEPARTMENTS_SECTION]: [] as string[],
      Engineering: ["u1"],
      Admin: [] as string[],
    };
    const result = mergeInviteeSelection(GROUPS_WITH_DEPTS, previous, draft, null);
    expect(result).toEqual(["dept:ghostDept", "user:u1", "user:ghost"]);
  });

  it("keeps the locked creator first even when draft deselects them", () => {
    const previous = ["user:u1", "user:u2"];
    const draft = {
      [INVITEE_DEPARTMENTS_SECTION]: [] as string[],
      Engineering: ["u1"], // u2 (creator) is not in draft but should stay via creator lock
      Admin: [] as string[],
    };
    // creator u2 not in draft pick, but creator lock re-adds it first
    expect(mergeInviteeSelection(GROUPS_WITH_DEPTS, previous, draft, "u2")).toEqual(["user:u2", "user:u1"]);
  });

  it("deselect-all visible leaves only inactive and creator", () => {
    const previous = ["user:u1", "user:ghost", "dept:d1"];
    const draft = {
      [INVITEE_DEPARTMENTS_SECTION]: [] as string[],
      Engineering: [] as string[],
      Admin: [] as string[],
    };
    expect(mergeInviteeSelection(GROUPS_WITH_DEPTS, previous, draft, null)).toEqual(["user:ghost"]);
  });

  it("adds newly selected users and departments", () => {
    const previous: string[] = [];
    const draft = {
      [INVITEE_DEPARTMENTS_SECTION]: ["d2"],
      Engineering: ["u2"],
      Admin: ["u3"],
    };
    expect(mergeInviteeSelection(GROUPS_WITH_DEPTS, previous, draft, null)).toEqual([
      "dept:d2",
      "user:u2",
      "user:u3",
    ]);
  });
});
