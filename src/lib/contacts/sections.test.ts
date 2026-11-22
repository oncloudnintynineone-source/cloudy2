import { describe, expect, it } from "vitest";

import type { RosterUser } from "@/lib/roster/queries";
import {
  buildContactRail,
  buildContactSections,
  contactInitial,
  NO_DEPARTMENT_SECTION_KEY,
  NO_DEPARTMENT_SECTION_LABEL,
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
