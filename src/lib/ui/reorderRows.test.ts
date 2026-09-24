import { describe, expect, it } from "vitest";
import type { DragEndEvent } from "@dnd-kit/react";

import {
  keysEqualOrder,
  moveToIndex,
  overrideIsStale,
  resolveDragMove,
  sameKeyMembership,
  swapAdjacent,
} from "./reorderRows";

const keyOf = (id: string) => id;

/** Minimal dnd-kit `dragend` stand-in. `projectedIndex` mirrors the sortable
 *  index the `OptimisticSortingPlugin` writes during a drag; `targetId`
 *  defaults to the source (what the plugin leaves as the drop target). */
function dragEnd(
  sourceId: string | null,
  projectedIndex: number,
  options: { targetId?: string | null; canceled?: boolean } = {},
): DragEndEvent {
  const canceled = options.canceled ?? false;
  const targetId = options.targetId === undefined ? sourceId : options.targetId;
  return {
    canceled,
    operation: {
      canceled,
      source:
        sourceId === null
          ? null
          : { id: sourceId, index: projectedIndex, initialIndex: projectedIndex },
      target: targetId === null ? null : { id: targetId },
    },
  } as unknown as DragEndEvent;
}

describe("keysEqualOrder", () => {
  it("is true for identical ordered key lists", () => {
    expect(keysEqualOrder(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
    expect(keysEqualOrder([], [])).toBe(true);
  });

  it("is false when order, membership or length differ", () => {
    expect(keysEqualOrder(["a", "c", "b"], ["a", "b", "c"])).toBe(false);
    expect(keysEqualOrder(["a", "b"], ["a", "b", "c"])).toBe(false);
    expect(keysEqualOrder(["a", "b"], ["a", "c"])).toBe(false);
  });
});

describe("sameKeyMembership", () => {
  it("ignores order", () => {
    expect(sameKeyMembership(["a", "c", "b"], ["b", "a", "c"])).toBe(true);
  });

  it("is false for duplicates or missing keys", () => {
    expect(sameKeyMembership(["a", "a"], ["a", "b"])).toBe(false);
    expect(sameKeyMembership(["a", "b"], ["a", "b", "c"])).toBe(false);
  });
});

describe("overrideIsStale", () => {
  it("drops once the authoritative rows match the override's order", () => {
    expect(overrideIsStale(["a", "c", "b"], ["a", "c", "b"])).toBe(true);
  });

  it("drops when membership changes (row added, removed, replaced)", () => {
    expect(overrideIsStale(["a", "b"], ["a", "c"])).toBe(true);
    expect(overrideIsStale(["a", "b"], ["a", "b", "c"])).toBe(true);
  });

  it("keeps a pure re-ordering the server hasn't caught up with yet", () => {
    expect(overrideIsStale(["a", "c", "b"], ["a", "b", "c"])).toBe(false);
  });
});

describe("swapAdjacent", () => {
  const rows = ["a", "b", "c", "d"];

  it("moves a row one step toward the front/back", () => {
    expect(swapAdjacent(rows, keyOf, "c", -1)).toEqual(["a", "c", "b", "d"]);
    expect(swapAdjacent(rows, keyOf, "a", 1)).toEqual(["b", "a", "c", "d"]);
  });

  it("returns null past either end or for an unknown id", () => {
    expect(swapAdjacent(rows, keyOf, "a", -1)).toBeNull();
    expect(swapAdjacent(rows, keyOf, "d", 1)).toBeNull();
    expect(swapAdjacent(rows, keyOf, "zz", 1)).toBeNull();
  });
});

describe("moveToIndex", () => {
  const rows = ["a", "b", "c", "d"];

  it("moves a row to an absolute index (arrayMove semantics)", () => {
    expect(moveToIndex(rows, keyOf, "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveToIndex(rows, keyOf, "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveToIndex(rows, keyOf, "b", 3)).toEqual(["a", "c", "d", "b"]);
  });

  it("clamps an out-of-range target index", () => {
    expect(moveToIndex(rows, keyOf, "a", 99)).toEqual(["b", "c", "d", "a"]);
    expect(moveToIndex(rows, keyOf, "d", -5)).toEqual(["d", "a", "b", "c"]);
  });

  it("returns null for a no-op or an unknown id", () => {
    expect(moveToIndex(rows, keyOf, "b", 1)).toBeNull();
    expect(moveToIndex(rows, keyOf, "zz", 0)).toBeNull();
  });
});

describe("resolveDragMove", () => {
  const keys = ["a", "b", "c", "d"];

  it("uses the source's projected index when the target is the source (optimistic sorting)", () => {
    expect(resolveDragMove(keys, dragEnd("d", 0))).toEqual({ id: "d", toIndex: 0 });
    expect(resolveDragMove(keys, dragEnd("a", 3))).toEqual({ id: "a", toIndex: 3 });
  });

  it("resolves a drop onto a different row", () => {
    expect(resolveDragMove(keys, dragEnd("b", 0, { targetId: "d" }))).toEqual({
      id: "b",
      toIndex: 0,
    });
  });

  it("returns null for a no-op move", () => {
    expect(resolveDragMove(keys, dragEnd("b", 1))).toBeNull();
  });

  it("returns null for a canceled drop, a missing source, or an unknown row", () => {
    expect(resolveDragMove(keys, dragEnd("d", 0, { canceled: true }))).toBeNull();
    expect(resolveDragMove(keys, dragEnd(null, 0))).toBeNull();
    expect(resolveDragMove(keys, dragEnd("zz", 0))).toBeNull();
  });
});
