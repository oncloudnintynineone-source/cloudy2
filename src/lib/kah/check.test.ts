import { describe, expect, it } from "vitest";

import {
  computeKahBreaches,
  inCountryPercentage,
  type KahAwayEvent,
  type KahGroupCheck,
} from "./check";

function group(overrides: Partial<KahGroupCheck> = {}): KahGroupCheck {
  return {
    id: "g-1",
    name: "Command",
    minPercentage: 60,
    memberIds: ["u-1", "u-2", "u-3", "u-4", "u-5"],
    ...overrides,
  };
}

function awayEvent(overrides: Partial<KahAwayEvent> = {}): KahAwayEvent {
  return {
    start: new Date("2026-01-05T00:00:00Z"),
    end: new Date("2026-01-06T00:00:00Z"),
    userIds: ["u-1", "u-2"],
    ...overrides,
  };
}

/** The saved event's own tagged attendees (the causal scope of a check). */
function saved(...ids: string[]): Set<string> {
  return new Set(ids);
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
    const breaches = computeKahBreaches([group()], [awayEvent()], saved("u-1"));
    expect(breaches).toEqual([]);
  });

  it("breaches when one more member goes away (40% < 60%)", () => {
    const breaches = computeKahBreaches(
      [group()],
      [awayEvent({ userIds: ["u-1", "u-2", "u-3"] })],
      saved("u-1"),
    );
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
    expect(
      computeKahBreaches(
        [group({ minPercentage: 40 })],
        [awayEvent({ userIds: ["u-1", "u-2", "u-3"] })],
        saved("u-1"),
      ),
    ).toEqual([]);
    expect(computeKahBreaches([group()], [awayEvent({ userIds: ["u-5"] })], saved("u-5"))).toEqual(
      [],
    );
  });

  it("skips empty groups and collapses duplicate member ids", () => {
    const empty = computeKahBreaches(
      [group({ id: "g-e", memberIds: [] }), group({ memberIds: ["u-1", "u-1"] })],
      [awayEvent({ userIds: ["u-1"] })],
      saved("u-1"),
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
      [awayEvent({ userIds: ["u-1", "u-4"] })],
      saved("u-1", "u-4"),
    );
    expect(breaches.map((breach) => breach.groupName)).toEqual(["Ops"]);
    expect(breaches[0].actualPct).toBe(50);
  });

  it("returns nothing when no groups are given", () => {
    expect(computeKahBreaches([], [awayEvent()], saved("u-1"))).toEqual([]);
  });

  it("ignores a group the saved event takes nobody away from", () => {
    // The group is below threshold from another event, but the saved event
    // tags no member of it — it must never notify this group.
    const breaches = computeKahBreaches(
      [group()],
      [awayEvent({ userIds: ["u-1", "u-2", "u-3"] })],
      saved("u-9"),
    );
    expect(breaches).toEqual([]);
  });

  it("uses the union window of the overseas events that put members away", () => {
    const breaches = computeKahBreaches(
      [group({ minPercentage: 80 })],
      [
        awayEvent({
          start: new Date("2026-01-05T00:00:00Z"),
          end: new Date("2026-01-06T00:00:00Z"),
          userIds: ["u-1"],
        }),
        awayEvent({
          start: new Date("2026-01-10T00:00:00Z"),
          end: new Date("2026-01-12T00:00:00Z"),
          userIds: ["u-2"],
        }),
      ],
      saved("u-1"),
    );
    expect(breaches).toHaveLength(1);
    expect(breaches[0].awayWindowStart).toEqual(new Date("2026-01-05T00:00:00Z"));
    expect(breaches[0].awayWindowEnd).toEqual(new Date("2026-01-12T00:00:00Z"));
  });

  it("never lets a non-member event change the away set or the union window", () => {
    const breaches = computeKahBreaches(
      [group({ minPercentage: 100 })],
      [
        awayEvent({ userIds: ["u-1"] }),
        awayEvent({
          start: new Date("2026-02-01T00:00:00Z"),
          end: new Date("2026-02-02T00:00:00Z"),
          userIds: ["u-9"],
        }),
      ],
      saved("u-1"),
    );
    expect(breaches).toHaveLength(1);
    expect(breaches[0].awayIds).toEqual(["u-1"]);
    expect(breaches[0].awayWindowEnd).toEqual(new Date("2026-01-06T00:00:00Z"));
  });
});
