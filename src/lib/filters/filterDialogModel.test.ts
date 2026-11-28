import { describe, expect, it } from "vitest";

import {
  effectiveSetLine,
  groupRowState,
  isGroupSearchable,
  panelSections,
  sectionChipAriaLabel,
  sectionChipLabel,
  sectionRendersAsChip,
  sectionState,
  showsSectionHeaders,
  toApplyGroup,
  type FilterModelGroup,
  type FilterModelOption,
} from "./filterDialogModel";

function options(prefix: string, count: number): FilterModelOption[] {
  const labelPrefix = prefix.toUpperCase().replace("-", "");
  return Array.from({ length: count }, (_, index) => ({
    value: `${prefix}${index + 1}`,
    label: `${labelPrefix}${index + 1}`,
  }));
}

const calendars: FilterModelGroup = {
  label: "Calendars",
  options: options("cal-", 3),
};

const users: FilterModelGroup = {
  label: "Users",
  variant: "search",
  options: options("u", 3),
};

describe("toApplyGroup", () => {
  it("carries the full option set so a stale id is never read as 'all'", () => {
    expect(toApplyGroup(calendars)).toEqual({
      label: "Calendars",
      optionCount: 3,
      variant: undefined,
      optionValues: ["cal-1", "cal-2", "cal-3"],
    });
  });
});

describe("groupRowState", () => {
  it("grid: a full selection reads as All and narrows nothing", () => {
    expect(groupRowState(calendars, ["cal-1", "cal-2", "cal-3"])).toMatchObject({
      kind: "all",
      label: "All",
      subtitle: "All calendars",
      active: false,
    });
  });

  it("grid: a subset names the count against the group", () => {
    expect(groupRowState(calendars, ["cal-1", "cal-2"])).toMatchObject({
      kind: "some",
      label: "2 of 3",
      subtitle: "2 of 3 calendars",
      active: true,
    });
  });

  it("grid: an empty selection says No <group>, not All", () => {
    expect(groupRowState(calendars, [])).toMatchObject({
      kind: "none",
      label: "None",
      subtitle: "No calendars",
      active: true,
    });
  });

  it("search: nothing picked is no filter, so it reads All too", () => {
    expect(groupRowState(users, [])).toMatchObject({
      kind: "all",
      subtitle: "All users",
      active: false,
    });
  });

  it("search: a subset counts against the whole option list", () => {
    expect(groupRowState(users, ["u1"]).subtitle).toBe("1 of 3 users");
  });

  it("a selection naming an id outside the option list never claims All", () => {
    // Regression: the option list can shrink under an applied pick.
    expect(groupRowState(calendars, ["cal-1", "cal-2", "gone"]).subtitle).toBe(
      "2 of 3 calendars",
    );
  });

  it("after Reset filters an untouched group says Default, never All", () => {
    // The draft is fully ticked, but Apply stores the role default — which for
    // a non-admin is only their own department, so "All" would be a promise the
    // dialog cannot keep.
    const draft = ["cal-1", "cal-2", "cal-3"];
    expect(groupRowState(calendars, draft, { cleared: true })).toMatchObject({
      kind: "default",
      label: "Default",
      subtitle: "Default",
      active: false,
    });
    expect(groupRowState(users, [], { cleared: true }).subtitle).toBe("Default");
  });

  it("editing a group after Reset replaces its Default with the real state", () => {
    expect(
      groupRowState(calendars, ["cal-1"], { cleared: true, touched: true }).subtitle,
    ).toBe("1 of 3 calendars");
  });
});

describe("isGroupSearchable", () => {
  it("stays off for a list that fits on one screen", () => {
    expect(isGroupSearchable({ label: "Status", options: options("s", 12) })).toBe(false);
  });

  it("turns on past the threshold", () => {
    expect(isGroupSearchable({ label: "Users", options: options("u", 13) })).toBe(true);
  });

  it("honours an explicit override in both directions", () => {
    expect(
      isGroupSearchable({ label: "Actors", options: options("a", 3), searchable: true }),
    ).toBe(true);
    expect(
      isGroupSearchable({ label: "Users", options: options("u", 99), searchable: false }),
    ).toBe(false);
  });
});

describe("panelSections", () => {
  const eventTypes: FilterModelGroup = {
    label: "Event Types",
    options: [...options("op-", 2), ...options("ad-", 2)],
    sections: [
      { id: "ops", label: "Operations", options: options("op-", 2) },
      { id: "admin", label: "Admin", options: options("ad-", 2) },
    ],
  };

  it("keeps the caller's sections in order with their own counts", () => {
    const sections = panelSections(eventTypes, "", ["op-1", "ad-1", "ad-2"]);
    expect(
      sections.map((section) => [section.label, section.selectedCount, section.totalCount]),
    ).toEqual([
      ["Operations", 1, 2],
      ["Admin", 2, 2],
    ]);
  });

  it("keeps a whole section when its label matches the query", () => {
    const sections = panelSections(eventTypes, "admin", []);
    expect(sections.map((section) => section.label)).toEqual(["Admin"]);
    expect(sections[0]?.options.map((option) => option.value)).toEqual(["ad-1", "ad-2"]);
  });

  it("narrows to matching options and drops emptied sections", () => {
    const sections = panelSections(eventTypes, "OP1", []);
    expect(sections.map((section) => section.key)).toEqual(["Operations"]);
    expect(sections[0]?.options.map((option) => option.value)).toEqual(["op-1"]);
  });

  it("builds department sections from options that carry a department", () => {
    const roster: FilterModelGroup = {
      label: "Users",
      variant: "search",
      options: [
        { value: "u1", label: "Ana", department: "Logistics", departmentSort: 2 },
        { value: "u2", label: "Bo", department: "HQ", departmentSort: 1 },
        { value: "u3", label: "Cy", department: null },
      ],
    };
    const sections = panelSections(roster, "", ["u1"]);
    expect(sections.map((section) => section.label)).toEqual(["HQ", "Logistics", "No department"]);
    expect(sections[1]?.selectedCount).toBe(1);
  });

  it("nests a department section under its parent", () => {
    const roster: FilterModelGroup = {
      label: "Users",
      variant: "search",
      options: [
        { value: "u1", label: "Ana", department: "HQ", departmentId: "hq", departmentSort: 1 },
        {
          value: "u2",
          label: "Bo",
          department: "Stores",
          departmentId: "stores",
          departmentParentId: "hq",
          departmentSort: 2,
        },
      ],
    };
    const sections = panelSections(roster, "", []);
    expect(sections.map((section) => [section.label, section.depth])).toEqual([
      ["HQ", 0],
      ["Stores", 1],
    ]);
  });

  it("falls back to one section named after the group", () => {
    const sections = panelSections({ label: "Status", options: options("s", 3) }, "", []);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.label).toBe("Status");
  });
});

describe("showsSectionHeaders", () => {
  it("stays quiet for a flat group", () => {
    const sections = panelSections({ label: "Status", options: options("s", 3) }, "", []);
    expect(showsSectionHeaders({ label: "Status", options: options("s", 3) }, sections)).toBe(
      false,
    );
  });

  it("names a lone section that says more than the group label", () => {
    const group: FilterModelGroup = {
      label: "Users",
      options: [
        { value: "u1", label: "Ana", department: "HQ" },
        { value: "u2", label: "Bo", department: "HQ" },
      ],
    };
    expect(showsSectionHeaders(group, panelSections(group, "", []))).toBe(true);
  });

  it("names every section once the group is chunked", () => {
    const group: FilterModelGroup = {
      label: "Event Types",
      options: [...options("op-", 1), ...options("ad-", 1)],
      sections: [
        { id: "ops", label: "Operations", options: options("op-", 1) },
        { id: "admin", label: "Admin", options: options("ad-", 1) },
      ],
    };
    expect(showsSectionHeaders(group, panelSections(group, "", []))).toBe(true);
  });
});

describe("sectionState", () => {
  const group: FilterModelGroup = {
    label: "Event Types",
    options: options("op-", 3),
    sections: [{ id: "ops", label: "Operations", options: options("op-", 3) }],
  };

  it("reads none / some / all for a section's own pair", () => {
    const [section] = panelSections(group, "", []);
    expect(section).toBeDefined();
    if (!section) return;
    expect(sectionState(section, [])).toBe("none");
    expect(sectionState(section, ["op-1", "op-2"])).toBe("some");
    expect(sectionState(section, ["op-1", "op-2", "op-3"])).toBe("all");
  });
});

describe("sectionRendersAsChip", () => {
  const typeGroup = (
    collapsible: boolean | undefined,
    id: string,
    label: string,
    count: number,
  ) => ({
    id,
    label,
    collapsible,
    options: options(`${id}-`, count),
  });

  it("stays inline for a flat group — there is nothing to hide behind", () => {
    const group: FilterModelGroup = { label: "Status", options: options("s", 3) };
    const sections = panelSections(group, "", []);
    expect(sectionRendersAsChip(sections[0]!, sections)).toBe(false);
  });

  it("groups departments by default (no flag on a department section)", () => {
    const group: FilterModelGroup = {
      label: "Users",
      options: [
        { value: "u1", label: "Ana", department: "HQ", departmentSort: 1 },
        { value: "u2", label: "Bo", department: "HQ", departmentSort: 1 },
        { value: "u3", label: "Cy", department: "Stores", departmentSort: 2 },
      ],
    };
    const sections = panelSections(group, "", []);
    expect(sections).toHaveLength(2);
    expect(sections.every((section) => sectionRendersAsChip(section, sections))).toBe(true);
  });

  it("honours an inline flag: collapsible false lists its chips straight away", () => {
    const group: FilterModelGroup = {
      label: "Event Types",
      options: [...options("op-", 2), ...options("ad-", 2)],
      sections: [typeGroup(false, "op", "Operations", 2), typeGroup(true, "ad", "Admin", 2)],
    };
    const sections = panelSections(group, "", []);
    const byLabel = new Map(sections.map((section) => [section.label, section]));
    expect(sectionRendersAsChip(byLabel.get("Operations")!, sections)).toBe(false);
    expect(sectionRendersAsChip(byLabel.get("Admin")!, sections)).toBe(true);
  });

  it("lists inline once a search narrows the panel to one section", () => {
    const group: FilterModelGroup = {
      label: "Event Types",
      options: [
        { value: "p1", label: "Plumbing" },
        { value: "e1", label: "Electrical" },
      ],
      sections: [
        {
          id: "ops",
          label: "Operations",
          collapsible: true,
          options: [{ value: "p1", label: "Plumbing" }],
        },
        {
          id: "eng",
          label: "Engineering",
          collapsible: true,
          options: [{ value: "e1", label: "Electrical" }],
        },
      ],
    };
    const narrowed = panelSections(group, "Plumbing", []);
    expect(narrowed).toHaveLength(1);
    expect(narrowed[0]?.label).toBe("Operations");
    expect(sectionRendersAsChip(narrowed[0]!, narrowed)).toBe(false);
  });

  it("carries the admin flag through panelSections", () => {
    const group: FilterModelGroup = {
      label: "Event Types",
      options: [...options("op-", 2), ...options("ad-", 2)],
      sections: [typeGroup(false, "op", "Operations", 2), typeGroup(true, "ad", "Admin", 2)],
    };
    expect(
      panelSections(group, "", []).map((section) => [section.label, section.collapsible]),
    ).toEqual([
      ["Operations", false],
      ["Admin", true],
    ]);
  });
});

describe("section chip labels", () => {
  const group: FilterModelGroup = {
    label: "Event Types",
    options: [...options("op-", 3), ...options("ad-", 1)],
    sections: [
      { id: "op", label: "Operations", options: options("op-", 3) },
      { id: "ad", label: "Admin", options: options("ad-", 1) },
    ],
  };

  it("states the count in words, not just a fill", () => {
    const [operations] = panelSections(group, "", ["op-1"]);
    expect(operations).toBeDefined();
    if (!operations) return;
    expect(sectionChipLabel(operations)).toBe("Operations 1 of 3");
    expect(sectionChipAriaLabel(operations)).toBe("Operations, 1 of 3 selected");
  });

  it("reads zero for a search group with nothing picked", () => {
    const [, admin] = panelSections({ ...group, variant: "search" }, "", []);
    expect(admin).toBeDefined();
    if (!admin) return;
    expect(sectionChipLabel(admin)).toBe("Admin 0 of 1");
  });
});

describe("effectiveSetLine", () => {
  const groups = [calendars, users];

  it("joins the group rows' own subtitles", () => {
    expect(
      effectiveSetLine(groups, { Calendars: ["cal-1"], Users: ["u1", "u2"] }),
    ).toBe("1 of 3 calendars · 2 of 3 users");
  });

  it("appends the trimmed free-text term", () => {
    expect(
      effectiveSetLine(groups, { Calendars: [], Users: [] }, { label: "Event name", value: "  parade " }),
    ).toBe('No calendars · All users · Event name "parade"');
  });

  it("omits a blank free-text term", () => {
    expect(
      effectiveSetLine(groups, { Calendars: [], Users: [] }, { label: "Event name", value: "   " }),
    ).toBe("No calendars · All users");
  });

  it("says Default for every group Reset left untouched", () => {
    expect(effectiveSetLine(groups, { Calendars: [], Users: [] }, undefined, { cleared: true })).toBe(
      "Default · Default",
    );
  });

  it("keeps an edited group honest after Reset", () => {
    expect(
      effectiveSetLine(groups, { Calendars: ["cal-1"], Users: [] }, undefined, {
        cleared: true,
        touched: new Set(["Calendars"]),
      }),
    ).toBe("1 of 3 calendars · Default");
  });
});
