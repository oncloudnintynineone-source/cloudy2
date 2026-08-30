import { describe, expect, it } from "vitest";

import { encodeEventNotes, encodeNotesBlock } from "@/lib/events/notes";
import type { KahGroupCheck } from "@/lib/kah/check";

import { eventTakesMembersOverseas, isUuid, kahStatusForWindow } from "./status";

/** A description carrying the given notes fields (an in-app internal event). */
function notesDescription(notes: { outOfCamp?: boolean; overseas?: boolean }): string {
  return encodeNotesBlock(encodeEventNotes(notes));
}

const makeGroup = (overrides: Partial<KahGroupCheck> & { id: string }): KahGroupCheck => ({
  name: overrides.id,
  minPercentage: 60,
  memberIds: [],
  ...overrides,
});

describe("kahStatusForWindow", () => {
  it("reports a safe group at or above its requirement", () => {
    const status = kahStatusForWindow(
      [makeGroup({ id: "g1", minPercentage: 60, memberIds: ["a", "b", "c"] })],
      new Set(["a"]),
    );
    expect(status).toEqual([
      {
        groupId: "g1",
        name: "g1",
        requiredPct: 60,
        actualPct: 66,
        totalMembers: 3,
        awayIds: ["a"],
        breached: false,
      },
    ]);
  });

  it("meets a requirement exactly at equality (not a breach)", () => {
    // 3 members with 2 in country = 66%, exactly meeting a 66% requirement.
    const status = kahStatusForWindow(
      [makeGroup({ id: "g1", minPercentage: 66, memberIds: ["a", "b", "c"] })],
      new Set(["a"]),
    );
    expect(status[0]).toMatchObject({ actualPct: 66, breached: false, awayIds: ["a"] });
  });

  it("flags a strict breach below the threshold", () => {
    const status = kahStatusForWindow(
      [makeGroup({ id: "g1", minPercentage: 70, memberIds: ["a", "b", "c"] })],
      new Set(["a", "b"]),
    );
    // 1/3 in country = 33% < 70%.
    expect(status[0]).toMatchObject({ actualPct: 33, breached: true, awayIds: ["a", "b"] });
  });

  it("reports an empty group at 100% and never breaches", () => {
    const status = kahStatusForWindow([makeGroup({ id: "g1", memberIds: [] })], new Set(["a"]));
    expect(status[0]).toMatchObject({ actualPct: 100, totalMembers: 0, breached: false });
  });

  it("collapses duplicate member ids and ignores away ids not in the group", () => {
    const status = kahStatusForWindow(
      [makeGroup({ id: "g1", minPercentage: 100, memberIds: ["a", "a", "b"] })],
      new Set(["a", "ghost"]),
    );
    // 2 unique members, 1 away -> 1/2 = 50% < 100%.
    expect(status[0]).toMatchObject({ totalMembers: 2, awayIds: ["a"], actualPct: 50, breached: true });
  });

  it("keeps input order and covers every group", () => {
    const status = kahStatusForWindow(
      [
        makeGroup({ id: "g1", memberIds: [] }),
        makeGroup({ id: "g2", minPercentage: 100, memberIds: ["a"] }),
      ],
      new Set(["a"]),
    );
    expect(status.map((s) => s.groupId)).toEqual(["g1", "g2"]);
  });
});

describe("eventTakesMembersOverseas", () => {
  it("is true only for events marked overseas (out of camp + overseas)", () => {
    expect(eventTakesMembersOverseas(notesDescription({ outOfCamp: true, overseas: true }))).toBe(
      true,
    );
  });

  it("is false for in-camp events", () => {
    expect(eventTakesMembersOverseas(notesDescription({ outOfCamp: false }))).toBe(false);
    expect(eventTakesMembersOverseas(notesDescription({}))).toBe(false);
  });

  it("is false for out-of-camp events that are not overseas", () => {
    expect(eventTakesMembersOverseas(notesDescription({ outOfCamp: true, overseas: false }))).toBe(
      false,
    );
    expect(eventTakesMembersOverseas(notesDescription({ outOfCamp: true }))).toBe(false);
  });

  it("is false for descriptions without a notes block (legacy/external)", () => {
    expect(eventTakesMembersOverseas("")).toBe(false);
    expect(eventTakesMembersOverseas("A plain Google event")).toBe(false);
  });
});

describe("isUuid", () => {
  it("accepts canonical UUIDs", () => {
    expect(isUuid("0b8d5f2e-1c47-4a90-9d3e-6f1a2b3c4d5e")).toBe(true);
    expect(isUuid("0B8D5F2E-1C47-4A90-9D3E-6F1A2B3C4D5E")).toBe(true);
  });

  it("rejects synthetic non-roster identities and malformed ids", () => {
    expect(isUuid("admin")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("0b8d5f2e1c474a909d3e6f1a2b3c4d5e")).toBe(false);
    expect(isUuid("0b8d5f2e-1c47-4a90-9d3e-6f1a2b3c4d5")).toBe(false);
  });
});
