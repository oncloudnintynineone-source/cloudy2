/** Minimal department shape needed to reason about the hierarchy. */
export interface HierarchyDepartment {
  id: string;
  name: string;
  sortOrder: number;
  parentId: string | null;
}

/** A node in the built department tree (children sorted for display). */
export interface DepartmentTreeNode {
  id: string;
  name: string;
  sortOrder: number;
  parentId: string | null;
  children: DepartmentTreeNode[];
}

function byDisplayOrder(a: HierarchyDepartment, b: HierarchyDepartment): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

/**
 * Walk up from `candidate` through the raw parent links; true when `nodeId`
 * is met on the way, i.e. `candidate` would be a descendant of `nodeId`.
 * Cycle-safe (a visited set ends the walk).
 */
function isAncestor(
  parentLinks: ReadonlyMap<string, string | null>,
  candidate: string,
  nodeId: string,
): boolean {
  let current: string | null | undefined = candidate;
  const seen = new Set<string>();
  while (typeof current === "string") {
    if (current === nodeId) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = parentLinks.get(current) ?? null;
  }
  return false;
}

/**
 * Build the department tree from a flat list.
 *
 * Top-level nodes are the ones with no parent (or a parent that is missing
 * from the list, or would create a cycle — a node is never linked to a
 * descendant of itself). Children keep display order (sortOrder, then name).
 * The walk is cycle-safe, so corrupt data degrades to a flat list instead of
 * an infinite loop.
 */
export function buildDepartmentTree(
  departments: readonly HierarchyDepartment[],
): DepartmentTreeNode[] {
  const parentLinks = new Map<string, string | null>(
    departments.map((dept) => [dept.id, dept.parentId]),
  );
  const nodes = new Map<string, DepartmentTreeNode>();
  for (const dept of departments) {
    nodes.set(dept.id, {
      id: dept.id,
      name: dept.name,
      sortOrder: dept.sortOrder,
      parentId: dept.parentId,
      children: [],
    });
  }

  const topLevel: DepartmentTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId !== null ? nodes.get(node.parentId) : undefined;
    const cycleFree =
      node.parentId === null || !isAncestor(parentLinks, node.parentId, node.id);
    if (parent && cycleFree) {
      parent.children.push(node);
    } else {
      topLevel.push(node);
    }
  }

  // Defensive second layer: any node unreachable from the top level (should be
  // impossible after the ancestor check) is promoted rather than dropped.
  const visited = new Set<string>();
  const visit = (node: DepartmentTreeNode) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    for (const child of node.children) visit(child);
  };
  for (const node of topLevel) visit(node);
  for (const node of nodes.values()) {
    if (!visited.has(node.id)) topLevel.push(node);
  }

  topLevel.sort(byDisplayOrder);
  for (const node of nodes.values()) {
    node.children.sort(byDisplayOrder);
  }
  return topLevel;
}

/** Find a node by id anywhere in the tree (or undefined). */
export function findDepartmentNode(
  tree: readonly DepartmentTreeNode[],
  id: string,
): DepartmentTreeNode | undefined {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = findDepartmentNode(node.children, id);
    if (found) return found;
  }
  return undefined;
}

/** Depth-first (parent before children) flattening of a department tree. */
export function flattenDepartmentTree(
  tree: readonly DepartmentTreeNode[],
): DepartmentTreeNode[] {
  const out: DepartmentTreeNode[] = [];
  const visit = (node: DepartmentTreeNode) => {
    out.push(node);
    for (const child of node.children) visit(child);
  };
  for (const node of tree) visit(node);
  return out;
}

/**
 * Ids of every transitive descendant of `rootId` (never the root itself).
 * Cycle-safe; unknown ids simply produce no descendants.
 */
export function descendantIds(
  departments: readonly HierarchyDepartment[],
  rootId: string,
): Set<string> {
  const children = new Map<string, string[]>();
  for (const dept of departments) {
    if (dept.parentId === null) continue;
    const list = children.get(dept.parentId) ?? [];
    list.push(dept.id);
    children.set(dept.parentId, list);
  }
  const out = new Set<string>();
  const stack = [...(children.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const child of children.get(id) ?? []) {
      stack.push(child);
    }
  }
  return out;
}

/**
 * Parent-department options for `selfId`'s edit form: every department in
 * display order except the department itself and its descendants (choosing
 * one of those would create a cycle).
 */
export function parentOptionsFor(
  departments: readonly HierarchyDepartment[],
  selfId: string,
): HierarchyDepartment[] {
  const excluded = new Set(descendantIds(departments, selfId));
  excluded.add(selfId);
  return [...departments].sort(byDisplayOrder).filter((dept) => !excluded.has(dept.id));
}

/**
 * Per-id move availability for the settings list: a department can move up
 * or down only when it has a sibling (same parent, or both top-level) in
 * that direction — the first/last child of a group cannot, no matter what
 * row sits next to it in the rendered tree.
 */
export function moveAvailability(
  departments: readonly HierarchyDepartment[],
): Map<string, { up: boolean; down: boolean }> {
  const tree = buildDepartmentTree(departments);
  const map = new Map<string, { up: boolean; down: boolean }>();
  const walk = (siblings: readonly DepartmentTreeNode[]) => {
    siblings.forEach((node, index) => {
      map.set(node.id, { up: index > 0, down: index < siblings.length - 1 });
      walk(node.children);
    });
  };
  walk(tree);
  return map;
}

/**
 * Swap a department with its adjacent sibling ("up" = previous sibling,
 * "down" = next sibling) and return the re-ranked flat list (sortOrder =
 * preorder position). The whole subtree moves with the node. Returns null
 * when the id is unknown or the node has no sibling in that direction
 * (first/last child). For a flat list (no parents) this is exactly the old
 * global up/down swap.
 */
export function moveInTreeOrder(
  departments: readonly HierarchyDepartment[],
  id: string,
  direction: "up" | "down",
): HierarchyDepartment[] | null {
  const tree = buildDepartmentTree(departments);

  let found: DepartmentTreeNode | undefined;
  let siblings: DepartmentTreeNode[] | undefined;
  const findIn = (nodes: DepartmentTreeNode[]): void => {
    for (const node of nodes) {
      if (node.id === id) {
        found = node;
        siblings = nodes;
        return;
      }
      findIn(node.children);
      if (found) return;
    }
  };
  findIn(tree);
  if (!found || !siblings) return null;

  const index = siblings.indexOf(found);
  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= siblings.length) return null;

  const neighbor = siblings[neighborIndex];
  siblings[neighborIndex] = found;
  siblings[index] = neighbor;

  return flattenDepartmentTree(tree).map(
    (node, sortOrder): HierarchyDepartment => ({
      id: node.id,
      name: node.name,
      sortOrder,
      parentId: node.parentId,
    }),
  );
}
