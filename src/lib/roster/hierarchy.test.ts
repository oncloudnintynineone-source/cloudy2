import { describe, expect, it } from "vitest";

import {
  buildDepartmentTree,
  descendantIds,
  flattenDepartmentTree,
  moveAvailability,
  moveInTreeOrder,
  parentOptionsFor,
  type HierarchyDepartment,
} from "./hierarchy";

const flat: HierarchyDepartment[] = [
  { id: "a", name: "Alpha", sortOrder: 0, parentId: null },
  { id: "b", name: "Bravo", sortOrder: 1, parentId: null },
  { id: "c", name: "Charlie", sortOrder: 2, parentId: null },
];

/**
 * HQ (0)
 * ├── Logistics (1)
 * │   └── Stores (2)
 * └── Ops (3)
 * Field (4)
 */
const tree: HierarchyDepartment[] = [
  { id: "hq", name: "HQ", sortOrder: 0, parentId: null },
  { id: "log", name: "Logistics", sortOrder: 1, parentId: "hq" },
  { id: "stores", name: "Stores", sortOrder: 2, parentId: "log" },
  { id: "ops", name: "Ops", sortOrder: 3, parentId: "hq" },
  { id: "field", name: "Field", sortOrder: 4, parentId: null },
];

const idsOf = (nodes: { id: string }[]) => nodes.map((node) => node.id);

describe("buildDepartmentTree", () => {
  it("keeps a flat list flat, in display order", () => {
    expect(idsOf(buildDepartmentTree(flat))).toEqual(["a", "b", "c"]);
  });

  it("nests children under their parent, sorted by sortOrder then name", () => {
    const [hq, field] = buildDepartmentTree(tree);
    expect(hq.id).toBe("hq");
    expect(idsOf(hq.children)).toEqual(["log", "ops"]);
    expect(idsOf(hq.children[0].children)).toEqual(["stores"]);
    expect(field.id).toBe("field");
    expect(field.children).toEqual([]);
  });

  it("promotes a department with a missing parent to top level", () => {
    const orphan: HierarchyDepartment[] = [
      ...tree,
      { id: "orphan", name: "Orphan", sortOrder: 5, parentId: "ghost" },
    ];
    const topLevel = buildDepartmentTree(orphan);
    expect(topLevel.map((node) => node.id)).toContain("orphan");
  });

  it("treats a self-parented department as top level", () => {
    const selfParented: HierarchyDepartment[] = [
      ...flat,
      { id: "selfy", name: "Selfy", sortOrder: 3, parentId: "selfy" },
    ];
    const result = buildDepartmentTree(selfParented);
    expect(result.map((node) => node.id)).toContain("selfy");
    expect(result.find((node) => node.id === "selfy")?.children).toEqual([]);
  });

  it("breaks a two-node cycle by promoting both to top level (no children links)", () => {
    const cycle: HierarchyDepartment[] = [
      { id: "x", name: "X", sortOrder: 0, parentId: "y" },
      { id: "y", name: "Y", sortOrder: 1, parentId: "x" },
      ...flat,
    ];
    const result = buildDepartmentTree(cycle);
    expect(result.map((node) => node.id).sort()).toEqual(["a", "b", "c", "x", "y"]);
    // Nothing may be nested: both cycle members are top level with no children.
    for (const node of result) {
      expect(node.children).toEqual([]);
    }
  });
});

describe("flattenDepartmentTree", () => {
  it("returns preorder (parent before children)", () => {
    expect(idsOf(flattenDepartmentTree(buildDepartmentTree(tree)))).toEqual([
      "hq",
      "log",
      "stores",
      "ops",
      "field",
    ]);
  });
});

describe("descendantIds", () => {
  it("collects transitive descendants, never the root itself", () => {
    expect([...descendantIds(tree, "hq")].sort()).toEqual(["log", "ops", "stores"]);
    expect(descendantIds(tree, "log").has("stores")).toBe(true);
    expect(descendantIds(tree, "stores")).toEqual(new Set());
    expect(descendantIds(tree, "ghost")).toEqual(new Set());
  });
});

describe("parentOptionsFor", () => {
  it("excludes the department itself and its descendants", () => {
    expect(idsOf(parentOptionsFor(tree, "hq"))).toEqual(["field"]);
    expect(idsOf(parentOptionsFor(tree, "log"))).toEqual(["hq", "ops", "field"]);
    expect(idsOf(parentOptionsFor(tree, "ops"))).toEqual(["hq", "log", "stores", "field"]);
    expect(idsOf(parentOptionsFor(tree, "stores"))).toEqual(["hq", "log", "ops", "field"]);
  });
});

describe("moveAvailability", () => {
  it("reflects sibling positions in the tree", () => {
    const availability = moveAvailability(tree);
    expect(availability.get("hq")).toEqual({ up: false, down: true });
    expect(availability.get("field")).toEqual({ up: true, down: false });
    expect(availability.get("log")).toEqual({ up: false, down: true });
    expect(availability.get("ops")).toEqual({ up: true, down: false });
    expect(availability.get("stores")).toEqual({ up: false, down: false });
  });

  it("matches the old first/last rules for a flat list", () => {
    const availability = moveAvailability(flat);
    expect(availability.get("a")).toEqual({ up: false, down: true });
    expect(availability.get("b")).toEqual({ up: true, down: true });
    expect(availability.get("c")).toEqual({ up: true, down: false });
  });
});

describe("moveInTreeOrder", () => {
  it("reproduces the old global swap for a flat list", () => {
    const moved = moveInTreeOrder(flat, "c", "up");
    expect(moved).not.toBeNull();
    expect(moved!.map((dept) => dept.id)).toEqual(["a", "c", "b"]);
    expect(moved!.map((dept) => dept.sortOrder)).toEqual([0, 1, 2]);
    expect(moveInTreeOrder(flat, "a", "up")).toBeNull();
    expect(moveInTreeOrder(flat, "c", "down")).toBeNull();
    expect(moveInTreeOrder(flat, "ghost", "up")).toBeNull();
  });

  it("swaps siblings under the same parent", () => {
    const moved = moveInTreeOrder(tree, "log", "down")!;
    expect(moved.map((dept) => dept.id)).toEqual(["hq", "ops", "log", "stores", "field"]);
    expect(moved.map((dept) => dept.sortOrder)).toEqual([0, 1, 2, 3, 4]);
    expect(moved.find((dept) => dept.id === "ops")?.parentId).toBe("hq");
    expect(moved.find((dept) => dept.id === "stores")?.parentId).toBe("log");
  });

  it("moves a parent together with its whole subtree", () => {
    const moved = moveInTreeOrder(tree, "field", "up")!;
    // Field jumps above the entire HQ subtree; the subtree keeps its shape.
    expect(moved.map((dept) => dept.id)).toEqual([
      "field",
      "hq",
      "log",
      "stores",
      "ops",
    ]);
    expect(moved.map((dept) => dept.sortOrder)).toEqual([0, 1, 2, 3, 4]);
  });

  it("returns null for first/last child of a group", () => {
    expect(moveInTreeOrder(tree, "log", "up")).toBeNull();
    expect(moveInTreeOrder(tree, "ops", "down")).toBeNull();
    expect(moveInTreeOrder(tree, "stores", "up")).toBeNull();
    expect(moveInTreeOrder(tree, "stores", "down")).toBeNull();
  });

  it("does not change parents or names while moving", () => {
    const moved = moveInTreeOrder(tree, "hq", "down")!;
    expect(moved.map((dept) => [dept.id, dept.parentId, dept.name])).toEqual([
      ["field", null, "Field"],
      ["hq", null, "HQ"],
      ["log", "hq", "Logistics"],
      ["stores", "log", "Stores"],
      ["ops", "hq", "Ops"],
    ]);
  });
});
