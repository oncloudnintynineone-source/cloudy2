import { describe, expect, it } from "vitest";

import type { RosterUser } from "@/lib/roster/queries";
import {
  activeSectionKey,
  buildContactRail,
  buildContactSections,
  contactInitial,
  contactRailHeightPx,
  NO_DEPARTMENT_SECTION_KEY,
  NO_DEPARTMENT_SECTION_LABEL,
  railIndexFromPoint,
  railIndicatorTopPx,
  railScrubEdgeDirection,
} from "@/lib/contacts/sections";

function user(
  id: string,
  name: string,
  department: { id: string; name: string } | null = null,
): RosterUser {
  return {
    id,
    name,
    shortname: null,
    phone: "0000",
    email: null,
    birthday: null,
    role: "user",
    status: "active",
    department: department ? { id: department.id, name: department.name, sortOrder: 0 } : null,
  };
}

describe("contactInitial", () => {
  it("uppercases ASCII initials", () => {
    expect(contactInitial("alice")).toBe("A");
    expect(contactInitial("  Tan Wei Ming")).toBe("T");
  });

  it("groups non-ASCII and empty names under #", () => {
    expect(contactInitial("李明")).toBe("#");
    expect(contactInitial("")).toBe("#");
  });
});

describe("buildContactSections (name sort)", () => {
  it("sections alphabetically with members sorted by name", () => {
    const sections = buildContactSections(
      [user("1", "Carol"), user("2", "alice"), user("3", "Bob")],
      "name",
    );
    expect(sections.map((section) => section.key)).toEqual(["A", "B", "C"]);
    expect(sections[0].users.map((u) => u.name)).toEqual(["alice"]);
  });

  it("puts the # section last", () => {
    const sections = buildContactSections([user("1", "李明"), user("2", "Zoe")], "name");
    expect(sections.map((section) => section.key)).toEqual(["Z", "#"]);
  });
});

describe("buildContactSections (department sort)", () => {
  it("groups by department alphabetically, department-less last", () => {
    const sections = buildContactSections(
      [
        user("1", "Zach", { id: "log", name: "Logistics" }),
        user("2", "Amy"),
        user("3", "Bea", { id: "hq", name: "HQ" }),
      ],
      "department",
    );
    expect(sections.map((section) => section.label)).toEqual([
      "HQ",
      "Logistics",
      NO_DEPARTMENT_SECTION_LABEL,
    ]);
    expect(sections[2].key).toBe(NO_DEPARTMENT_SECTION_KEY);
  });

  it("sorts members by name inside a department", () => {
    const sections = buildContactSections(
      [
        user("1", "Yan", { id: "hq", name: "HQ" }),
        user("2", "Avi", { id: "hq", name: "HQ" }),
      ],
      "department",
    );
    expect(sections[0].users.map((u) => u.name)).toEqual(["Avi", "Yan"]);
  });
});

describe("buildContactRail", () => {
  it("lists one entry per initial in section order", () => {
    const sections = buildContactSections(
      [user("1", "Amy"), user("2", "Ben"), user("3", "Zoe")],
      "name",
    );
    expect(buildContactRail(sections)).toEqual([
      { key: "A", sectionKey: "A" },
      { key: "B", sectionKey: "B" },
      { key: "Z", sectionKey: "Z" },
    ]);
  });

  it("collapses departments sharing an initial to the first section", () => {
    const sections = buildContactSections(
      [
        user("1", "A", { id: "log", name: "Logistics" }),
        user("2", "B", { id: "log2", name: "Logistics 2" }),
        user("3", "C", { id: "med", name: "Medical" }),
      ],
      "department",
    );
    expect(buildContactRail(sections)).toEqual([
      { key: "L", sectionKey: "log" },
      { key: "M", sectionKey: "med" },
    ]);
  });
});

describe("activeSectionKey", () => {
  const entries = [
    { key: "A", top: -400 },
    { key: "B", top: -120 },
    { key: "C", top: 60 },
    { key: "D", top: 320 },
  ];

  it("picks the last header already above the activation line", () => {
    expect(activeSectionKey(entries, 0)).toBe("B");
    expect(activeSectionKey(entries, 100)).toBe("C");
    expect(activeSectionKey(entries, 400)).toBe("D");
  });

  it("falls back to the first section before anything scrolls", () => {
    expect(activeSectionKey([{ key: "A", top: 300 }], 100)).toBe("A");
  });

  it("returns null for an empty list", () => {
    expect(activeSectionKey([], 100)).toBeNull();
  });

  it("resolves headers level on one line to the first of them", () => {
    const level = [
      { key: "A", top: -300 },
      { key: "B", top: -300 },
      { key: "C", top: 40 },
      { key: "D", top: 40 },
    ];
    expect(activeSectionKey(level, 100)).toBe("C");
    expect(activeSectionKey(level, 0)).toBe("A");
  });

  it("treats sub-pixel jitter as level", () => {
    const jittered = [
      { key: "A", top: 100 },
      { key: "B", top: 100.4 },
    ];
    expect(activeSectionKey(jittered, 200)).toBe("A");
  });

  it("hands back whatever key the caller passes, so section keys work too", () => {
    // Department sort: several departments share an initial, so the caller
    // passes section keys (and derives the rail letter + label itself) — the
    // floating indicator has to name the section, not the ambiguous letter.
    const byDepartment = [
      { key: "dept-design", top: -220 },
      { key: "dept-logistics", top: 40 },
      { key: "dept-learning", top: 260 },
    ];
    expect(activeSectionKey(byDepartment, 100)).toBe("dept-logistics");
    expect(activeSectionKey(byDepartment, 300)).toBe("dept-learning");
  });
});

describe("contactRailHeightPx", () => {
  it("is the letter stack plus the pill's padding and border", () => {
    expect(contactRailHeightPx(0)).toBe(14);
    expect(contactRailHeightPx(4)).toBe(94);
    expect(contactRailHeightPx(26)).toBe(534);
  });
});

describe("railIndicatorTopPx", () => {
  it("is the letter slot's centre from the pill's border-box top", () => {
    // border 1 + padding 6 + whole letter slots + half of the active slot.
    expect(railIndicatorTopPx(0)).toBe(17);
    expect(railIndicatorTopPx(1)).toBe(37);
    expect(railIndicatorTopPx(25)).toBe(517);
  });

  it("keeps every slot's chip inside the pill it is drawn against", () => {
    // The CSS clamp bounds are 14px (half the chip) in from each edge, so an
    // unscrolled rail never needs clamping — the chip always sits on the pill.
    for (const count of [4, 12, 26]) {
      const height = contactRailHeightPx(count);
      for (let index = 0; index < count; index += 1) {
        const top = railIndicatorTopPx(index);
        expect(top - 14).toBeGreaterThanOrEqual(0);
        expect(top + 14).toBeLessThanOrEqual(height);
      }
    }
  });
});

describe("railIndexFromPoint", () => {
  // Three 20px bands stacked from y = 100: A 100–120, B 120–140, C 140–160.
  const bands = [
    { top: 100, bottom: 120 },
    { top: 120, bottom: 140 },
    { top: 140, bottom: 160 },
  ];

  it("picks the band under the pointer", () => {
    expect(railIndexFromPoint(bands, 110)).toBe(0);
    expect(railIndexFromPoint(bands, 130)).toBe(1);
    expect(railIndexFromPoint(bands, 150)).toBe(2);
  });

  it("gives a band boundary to the later band, and the last bottom edge to the last band", () => {
    expect(railIndexFromPoint(bands, 120)).toBe(1);
    expect(railIndexFromPoint(bands, 140)).toBe(2);
    expect(railIndexFromPoint(bands, 160)).toBe(2);
  });

  it("clamps a pointer past either end to the first / last letter", () => {
    expect(railIndexFromPoint(bands, 0)).toBe(0);
    expect(railIndexFromPoint(bands, 99.9)).toBe(0);
    expect(railIndexFromPoint(bands, 1000)).toBe(2);
  });

  it("maps correctly while the rail is internally scrolled (shifted bands)", () => {
    const shifted = bands.map((band) => ({ top: band.top - 80, bottom: band.bottom - 80 }));
    expect(railIndexFromPoint(shifted, 30)).toBe(0);
    expect(railIndexFromPoint(shifted, 50)).toBe(1);
    expect(railIndexFromPoint(shifted, 70)).toBe(2);
  });

  it("returns null for an empty rail", () => {
    expect(railIndexFromPoint([], 120)).toBeNull();
  });
});

describe("railScrubEdgeDirection", () => {
  // Rail spans y = 100–300, edge band 20px.
  it("scrolls up while the pointer sits in the top band (or above the rail)", () => {
    expect(railScrubEdgeDirection(100, 100, 300, 20)).toBe(-1);
    expect(railScrubEdgeDirection(119, 100, 300, 20)).toBe(-1);
    expect(railScrubEdgeDirection(40, 100, 300, 20)).toBe(-1);
  });

  it("scrolls down while the pointer sits in the bottom band (or below the rail)", () => {
    expect(railScrubEdgeDirection(281, 100, 300, 20)).toBe(1);
    expect(railScrubEdgeDirection(300, 100, 300, 20)).toBe(1);
    expect(railScrubEdgeDirection(500, 100, 300, 20)).toBe(1);
  });

  it("holds still in the middle of the rail", () => {
    expect(railScrubEdgeDirection(121, 100, 300, 20)).toBe(0);
    expect(railScrubEdgeDirection(200, 100, 300, 20)).toBe(0);
    expect(railScrubEdgeDirection(279, 100, 300, 20)).toBe(0);
  });
});
