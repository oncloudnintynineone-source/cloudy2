import { describe, expect, it } from "vitest";

import { buildParadeSections, type ParadeSectionUser } from "./sections";

interface TestUser extends ParadeSectionUser {
  name: string;
}

function user(id: string, departmentId: string | null, name = id): TestUser {
  return { id, name, department: departmentId ? { id: departmentId } : null };
}

const calendars = [
  { id: "hq", name: "HQ", sortOrder: 0, parentId: null },
  { id: "ops", name: "Ops", sortOrder: 1, parentId: "hq" },
  { id: "log", name: "Logistics", sortOrder: 2, parentId: null },
];

describe("buildParadeSections", () => {
  it("buckets users into their direct department and nests children", () => {
    const sections = buildParadeSections(
      [user("u1", "hq"), user("u2", "ops"), user("u3", "log")],
      calendars,
    );
    expect(sections.map((s) => s.name)).toEqual(["HQ", "Logistics", "Unassigned"]);
    const hq = sections[0];
    expect(hq.users.map((u) => u.id)).toEqual(["u1"]);
    expect(hq.children.map((c) => c.name)).toEqual(["Ops"]);
    expect(hq.children[0].users.map((u) => u.id)).toEqual(["u2"]);
  });

  it("keeps department order from sortOrder", () => {
    const sections = buildParadeSections([], [
      { id: "b", name: "B", sortOrder: 1, parentId: null },
      { id: "a", name: "A", sortOrder: 0, parentId: null },
    ]);
    expect(sections.map((s) => s.name)).toEqual(["A", "B", "Unassigned"]);
  });

  it("puts users without a department in the terminal Unassigned section", () => {
    const sections = buildParadeSections([user("u1", null)], calendars);
    const unassigned = sections.at(-1)!;
    expect(unassigned.id).toBeNull();
    expect(unassigned.name).toBe("Unassigned");
    expect(unassigned.users.map((u) => u.id)).toEqual(["u1"]);
  });

  it("keeps departments with no users as empty sections (so the tree still renders)", () => {
    const sections = buildParadeSections([user("u1", "hq")], calendars);
    const logistics = sections.find((s) => s.name === "Logistics")!;
    expect(logistics.users).toEqual([]);
  });
});
