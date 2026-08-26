import { describe, expect, it } from "vitest";

import { computeKahBreaches, inCountryPercentage, type KahGroupCheck } from "./check";

function group(overrides: Partial<KahGroupCheck> = {}): KahGroupCheck {
  return {
    id: "g-1",
    name: "Command",
    minPercentage: 60,
    memberIds: ["u-1", "u-2", "u-3", "u-4", "u-5"],
    ...overrides,
  };
}

describe("inCountryPercentage", () => {
  it("floors the in-country share to a whole percentage", () => {
    expect(inCountryPercentage(3, 1)).toBe(66);
  });

  it("meets a requirement exactly at equality", () => {
    expect(inCountryPercentage(5, 2)).toBe(60);
  });

  it("returns 0 when everyone is away and clamps negative away counts", () => {
    expect(inCountryPercentage(4, 4)).toBe(0);
    expect(inCountryPercentage(4, -2)).toBe(100);
  });

  it("returns 100 for an empty group", () => {
    expect(inCountryPercentage(0, 0)).toBe(100);
  });
});

describe("computeKahBreaches", () => {
  it("does not breach when the required share is met exactly", () => {
    // 3 of 5 members in country = 60%, exactly meeting a 60% requirement.
    const breaches = computeKahBreaches([group()], new Set(["u-1", "u-2"]));
    expect(breaches).toEqual([]);
  });

  it("breaches when one more member goes away (40% < 60%)", () => {
    const breaches = computeKahBreaches([group()], new Set(["u-1", "u-2", "u-3"]));
    expect(breaches).toHaveLength(1);
    expect(breaches[0]).toMatchObject({
      groupId: "g-1",
      groupName: "Command",
      requiredPct: 60,
      actualPct: 40,
      totalMembers: 5,
      awayIds: ["u-1", "u-2", "u-3"],
    });
  });

  it("does not breach at exact equality or above", () => {
    expect(computeKahBreaches([group({ minPercentage: 40 })], new Set(["u-1", "u-2", "u-3"]))).toEqual(
      [],
    );
    expect(computeKahBreaches([group()], new Set(["u-5"]))).toEqual([]);
  });

  it("skips empty groups and collapses duplicate member ids", () => {
    const empty = computeKahBreaches(
      [group({ id: "g-e", memberIds: [] }), group({ memberIds: ["u-1", "u-1"] })],
      new Set(["u-1"]),
    );
    // g-e skipped; g-1 has 1 unique member who is away → 0% < 60%.
    expect(empty).toHaveLength(1);
    expect(empty[0].totalMembers).toBe(1);
  });

  it("evaluates each group against its own members and threshold", () => {
    const breaches = computeKahBreaches(
      [
        group(),
        group({
          id: "g-2",
          name: "Ops",
          minPercentage: 100,
          memberIds: ["u-4", "u-6"],
        }),
      ],
      new Set(["u-1", "u-4"]),
    );
    expect(breaches.map((breach) => breach.groupName)).toEqual(["Ops"]);
    expect(breaches[0].actualPct).toBe(50);
  });

  it("returns nothing when no groups are given", () => {
    expect(computeKahBreaches([], new Set(["u-1"]))).toEqual([]);
  });
});
