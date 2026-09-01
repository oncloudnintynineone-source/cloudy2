import { describe, expect, it } from "vitest";

import {
  buildEventTypePickerSections,
  moveEventTypeGroupOrder,
  sortEventTypeGroups,
  UNGROUPED_LABEL,
  type EventTypeGroupRef,
  type EventTypeRef,
} from "./groups";

const group = (id: string, name: string, sortOrder: number): EventTypeGroupRef => ({
  id,
  name,
  sortOrder,
});

const type = (name: string, groupId: string | null): EventTypeRef => ({ name, groupId });

describe("sortEventTypeGroups", () => {
  it("orders by sortOrder, then name", () => {
    const sorted = sortEventTypeGroups([group("c", "C", 1), group("a", "B", 1), group("b", "A", 0)]);
    expect(sorted.map((g) => g.name)).toEqual(["A", "B", "C"]);
  });
});

describe("buildEventTypePickerSections", () => {
  it("lists groups in display order with types by name, ungrouped last", () => {
    const sections = buildEventTypePickerSections(
      [
        type("Zeta", null),
        type("Alpha", "g2"),
        type("Beta", "g1"),
        type("Gamma", "g2"),
        type("Eta", null),
      ],
      [group("g2", "Leave", 0), group("g1", "Drill", 1)],
    );
    expect(sections).toEqual([
      { name: "Leave", ungrouped: false, types: [type("Alpha", "g2"), type("Gamma", "g2")] },
      { name: "Drill", ungrouped: false, types: [type("Beta", "g1")] },
      { name: UNGROUPED_LABEL, ungrouped: true, types: [type("Eta", null), type("Zeta", null)] },
    ]);
  });

  it("skips empty groups and omits the ungrouped section when nothing is ungrouped", () => {
    const sections = buildEventTypePickerSections([type("Alpha", "g1")], [
      group("g1", "Leave", 0),
      group("g2", "Drill", 1),
    ]);
    expect(sections).toEqual([
      { name: "Leave", ungrouped: false, types: [type("Alpha", "g1")] },
    ]);
  });

  it("returns no sections when there are no types", () => {
    expect(buildEventTypePickerSections([], [group("g1", "Leave", 0)])).toEqual([]);
  });

  it("degrades a type with a dangling group id to ungrouped", () => {
    const sections = buildEventTypePickerSections(
      [type("Alpha", "missing"), type("Beta", null)],
      [group("g1", "Leave", 0)],
    );
    expect(sections).toEqual([
      { name: UNGROUPED_LABEL, ungrouped: true, types: [type("Alpha", "missing"), type("Beta", null)] },
    ]);
  });
});

describe("moveEventTypeGroupOrder", () => {
  const groups = [group("a", "A", 0), group("b", "B", 1), group("c", "C", 2)];

  it("swaps with the previous group and re-ranks on up", () => {
    expect(moveEventTypeGroupOrder(groups, "b", "up")).toEqual([
      group("b", "B", 0),
      group("a", "A", 1),
      group("c", "C", 2),
    ]);
  });

  it("swaps with the next group and re-ranks on down", () => {
    expect(moveEventTypeGroupOrder(groups, "a", "down")).toEqual([
      group("b", "B", 0),
      group("a", "A", 1),
      group("c", "C", 2),
    ]);
  });

  it("returns null at the top on up and at the bottom on down", () => {
    expect(moveEventTypeGroupOrder(groups, "a", "up")).toBeNull();
    expect(moveEventTypeGroupOrder(groups, "c", "down")).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(moveEventTypeGroupOrder(groups, "missing", "up")).toBeNull();
  });

  it("sorts unsorted input by sortOrder first and closes rank gaps", () => {
    expect(
      moveEventTypeGroupOrder([group("c", "C", 9), group("a", "A", 0), group("b", "B", 5)], "b", "down"),
    ).toEqual([group("a", "A", 0), group("c", "C", 1), group("b", "B", 2)]);
  });
});
