import { describe, expect, it } from "vitest";

import {
  keysEqualOrder,
  overrideIsStale,
  sameKeyMembership,
  swapAdjacent,
} from "./reorderRows";

const keyOf = (id: string) => id;

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
