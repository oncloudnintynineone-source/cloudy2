import { describe, expect, it } from "vitest";

import {
  buildEventTypePickerSections,
  initialExpandedSectionIds,
  moveEventTypeGroupOrder,
  sortEventTypeGroups,
  UNGROUPED_ID,
  UNGROUPED_LABEL,
  type EventTypeGroupRef,
  type EventTypeRef,
} from "./groups";

const group = (
  id: string,
  name: string,
  sortOrder: number,
  collapsible = true,
): EventTypeGroupRef => ({
  id,
  name,
  sortOrder,
  collapsible,
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
      {
        id: "g2",
        name: "Leave",
        ungrouped: false,
        collapsible: true,
        types: [type("Alpha", "g2"), type("Gamma", "g2")],
      },
      {
        id: "g1",
        name: "Drill",
        ungrouped: false,
        collapsible: true,
        types: [type("Beta", "g1")],
      },
      {
        id: UNGROUPED_ID,
        name: UNGROUPED_LABEL,
        ungrouped: true,
        collapsible: false,
        types: [type("Eta", null), type("Zeta", null)],
      },
    ]);
  });

  it("carries each group's collapsible flag; the ungrouped section is never collapsible", () => {
    const sections = buildEventTypePickerSections(
      [type("Alpha", "g1"), type("Beta", "g2")],
      [group("g1", "Leave", 0, false), group("g2", "Drill", 1, true)],
    );
    expect(sections.map((section) => [section.id, section.collapsible])).toEqual([
      ["g1", false],
      ["g2", true],
    ]);
  });

  it("skips empty groups and omits the ungrouped section when nothing is ungrouped", () => {
    const sections = buildEventTypePickerSections([type("Alpha", "g1")], [
      group("g1", "Leave", 0),
      group("g2", "Drill", 1),
    ]);
    expect(sections).toEqual([
      { id: "g1", name: "Leave", ungrouped: false, collapsible: true, types: [type("Alpha", "g1")] },
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
      {
        id: UNGROUPED_ID,
        name: UNGROUPED_LABEL,
        ungrouped: true,
        collapsible: false,
        types: [type("Alpha", "missing"), type("Beta", null)],
      },
    ]);
  });
});

describe("initialExpandedSectionIds", () => {
  const sections = buildEventTypePickerSections(
    [type("Alpha", "g2"), type("Beta", "g1"), type("Eta", null)],
    [group("g2", "Leave", 0, true), group("g1", "Drill", 1, false)],
  );

  it("opens the collapsible folder that holds the selected type", () => {
    expect(initialExpandedSectionIds(sections, "Alpha")).toEqual(["g2"]);
  });

  it("does not open a non-collapsible group or the ungrouped section", () => {
    expect(initialExpandedSectionIds(sections, "Beta")).toEqual([]);
    expect(initialExpandedSectionIds(sections, "Eta")).toEqual([]);
  });

  it("starts every folder collapsed when nothing is selected", () => {
    expect(initialExpandedSectionIds(sections, null)).toEqual([]);
    expect(initialExpandedSectionIds(sections, "")).toEqual([]);
  });

  it("starts a lone collapsible folder collapsed when nothing is selected", () => {
    const single = buildEventTypePickerSections([type("Alpha", "g1")], [group("g1", "Leave", 0)]);
    expect(initialExpandedSectionIds(single, null)).toEqual([]);
    expect(initialExpandedSectionIds(single, "Alpha")).toEqual(["g1"]);
  });

  it("starts collapsed when the selected name matches no section", () => {
    expect(initialExpandedSectionIds(sections, "Missing")).toEqual([]);
  });

  it("returns an empty list for no sections", () => {
    expect(initialExpandedSectionIds([], "Alpha")).toEqual([]);
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
