import { describe, expect, it } from "vitest";

import {
  departmentHeadcount,
  departmentSummaryRows,
  departmentTreeHeadcount,
} from "./headcount";

describe("departmentHeadcount", () => {
  it("counts everyone as present when no user has events", () => {
    const users = [{ id: "u1" }, { id: "u2" }, { id: "u3" }];
    expect(departmentHeadcount(users, new Map())).toEqual({ total: 3, present: 3 });
  });

  it("excludes users with at least one out-of-camp event", () => {
    const users = [{ id: "u1" }, { id: "u2" }, { id: "u3" }];
    const eventsByUser = new Map([
      ["u2", [{ id: "e1" }]],
      ["u3", [{ id: "e2" }]],
    ]);
    expect(departmentHeadcount(users, eventsByUser)).toEqual({ total: 3, present: 1 });
  });

  it("counts a user once even with multiple out-of-camp events", () => {
    const users = [{ id: "u1" }];
    const eventsByUser = new Map([["u1", [{ id: "e1" }, { id: "e2" }]]]);
    expect(departmentHeadcount(users, eventsByUser)).toEqual({ total: 1, present: 0 });
  });

  it("handles an empty department", () => {
    expect(departmentHeadcount([], new Map())).toEqual({ total: 0, present: 0 });
  });
});

describe("departmentTreeHeadcount", () => {
  it("aggregates direct and descendant users", () => {
    const node = {
      users: [{ id: "u1" }, { id: "u2" }],
      children: [
        { users: [{ id: "u3" }], children: [] },
        { users: [{ id: "u4" }, { id: "u5" }], children: [] },
      ],
    };
    expect(departmentTreeHeadcount(node, new Map())).toEqual({ total: 5, present: 5 });
  });

  it("aggregates out-of-camp exclusions across levels", () => {
    const node = {
      users: [{ id: "u1" }],
      children: [
        {
          users: [{ id: "u2" }],
          children: [{ users: [{ id: "u3" }, { id: "u4" }], children: [] }],
        },
      ],
    };
    const eventsByUser = new Map([
      ["u1", [{ id: "e1" }]],
      ["u3", [{ id: "e2" }]],
    ]);
    expect(departmentTreeHeadcount(node, eventsByUser)).toEqual({ total: 4, present: 2 });
  });

  it("handles an empty tree", () => {
    expect(departmentTreeHeadcount({ users: [], children: [] }, new Map())).toEqual({
      total: 0,
      present: 0,
    });
  });
});

describe("departmentSummaryRows", () => {
  const users = (ids: string[]) => ids.map((id) => ({ id }));

  it("emits a Total and one row per section in tree order", () => {
    const sections = [
      { name: "Engineering", users: users(["u1", "u2"]), children: [] },
      {
        name: "Security Monitoring",
        users: [],
        children: [
          { name: "Team A", users: users(["a1", "a2", "a3"]), children: [] },
          { name: "Team B", users: users(["b1", "b2"]), children: [] },
        ],
      },
    ];
    const summary = departmentSummaryRows(sections, () => true);
    expect(summary.rows).toEqual([
      { name: "Engineering", depth: 0, present: 2, total: 2 },
      { name: "Security Monitoring", depth: 0, present: 5, total: 5 },
      { name: "Team A", depth: 1, present: 3, total: 3 },
      { name: "Team B", depth: 1, present: 2, total: 2 },
    ]);
    expect(summary.total).toEqual({ present: 7, total: 7 });
  });

  it("aggregates out-of-camp exclusions and never double counts the Total", () => {
    const sections = [
      {
        name: "Security Monitoring",
        users: users(["s1"]),
        children: [
          { name: "Team A", users: users(["a1"]), children: [] },
          { name: "Team B", users: users(["b1", "b2"]), children: [] },
        ],
      },
    ];
    // Everyone is out of camp except s1 and a1.
    const isPresent = (id: string) => id === "s1" || id === "a1";
    const summary = departmentSummaryRows(sections, isPresent);
    expect(summary.rows).toEqual([
      { name: "Security Monitoring", depth: 0, present: 2, total: 4 },
      { name: "Team A", depth: 1, present: 1, total: 1 },
      { name: "Team B", depth: 1, present: 0, total: 2 },
    ]);
    expect(summary.total).toEqual({ present: 2, total: 4 });
  });

  it("skips sections whose subtree has no users (matching the rendered body)", () => {
    const sections = [
      { name: "Engineering", users: [], children: [] },
      { name: "Human Resources", users: users(["h1"]), children: [] },
    ];
    const summary = departmentSummaryRows(sections, () => true);
    expect(summary.rows).toEqual([{ name: "Human Resources", depth: 0, present: 1, total: 1 }]);
    expect(summary.total).toEqual({ present: 1, total: 1 });
  });

  it("emits a parent row even without direct users when its children have users", () => {
    const sections = [
      {
        name: "Security Monitoring",
        users: [],
        children: [{ name: "Team A", users: users(["a1"]), children: [] }],
      },
    ];
    const summary = departmentSummaryRows(sections, () => true);
    expect(summary.rows).toEqual([
      { name: "Security Monitoring", depth: 0, present: 1, total: 1 },
      { name: "Team A", depth: 1, present: 1, total: 1 },
    ]);
    expect(summary.total).toEqual({ present: 1, total: 1 });
  });

  it("honors the isPresent predicate (attendance-mode present counts)", () => {
    const sections = [{ name: "Engineering", users: users(["u1", "u2", "u3"]), children: [] }];
    const summary = departmentSummaryRows(sections, (id) => id !== "u2");
    expect(summary.rows).toEqual([{ name: "Engineering", depth: 0, present: 2, total: 3 }]);
    expect(summary.total).toEqual({ present: 2, total: 3 });
  });

  it("handles an empty section list", () => {
    const summary = departmentSummaryRows([], () => true);
    expect(summary.rows).toEqual([]);
    expect(summary.total).toEqual({ present: 0, total: 0 });
  });
});