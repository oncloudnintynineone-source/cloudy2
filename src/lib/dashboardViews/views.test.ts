import { describe, expect, it } from "vitest";

import {
  DASHBOARD_VIEW_KINDS,
  DASHBOARD_VIEW_KIND_LABELS,
  isDashboardViewKind,
  nameAfterKindChange,
  normalizeFilterOverride,
  resolveActiveTab,
  sanitizeDashboardViewName,
  viewSwitchDirection,
  type DashboardViewTab,
} from "./views";

const month: DashboardViewTab = {
  id: "m",
  kind: "month",
  name: "Month",
  sortOrder: 0,
  filters: { cal: null, users: null, types: null },
};
const agendaA: DashboardViewTab = {
  id: "a1",
  kind: "agenda",
  name: "My Agenda",
  sortOrder: 1,
  filters: { cal: ["c1"], users: null, types: ["Leave"] },
};
const agendaB: DashboardViewTab = {
  id: "a2",
  kind: "agenda",
  name: "Ops Agenda",
  sortOrder: 2,
  filters: { cal: [], users: ["u1"], types: null },
};
const tabs = [month, agendaA, agendaB];

describe("isDashboardViewKind", () => {
  it("accepts the five renderer kinds", () => {
    for (const kind of DASHBOARD_VIEW_KINDS) {
      expect(isDashboardViewKind(kind)).toBe(true);
    }
  });
  it("rejects anything else", () => {
    for (const raw of ["foobar", "", 7, null, undefined, {}]) {
      expect(isDashboardViewKind(raw)).toBe(false);
    }
  });
});

describe("sanitizeDashboardViewName", () => {
  it("trims and accepts a normal name", () => {
    expect(sanitizeDashboardViewName("  Ops Month ")).toEqual({
      ok: true,
      value: "Ops Month",
    });
  });
  it("rejects blanks", () => {
    for (const raw of ["", "   ", null, undefined, 42]) {
      expect(sanitizeDashboardViewName(raw).ok).toBe(false);
    }
  });
  it("rejects over-long names", () => {
    const result = sanitizeDashboardViewName("x".repeat(41));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("40");
  });
  it("accepts a name of exactly the max length", () => {
    expect(sanitizeDashboardViewName("x".repeat(40)).ok).toBe(true);
  });
});

describe("normalizeFilterOverride", () => {
  it("keeps explicit empty arrays (a cleared selection)", () => {
    expect(normalizeFilterOverride([])).toEqual([]);
  });
  it("keeps non-empty string arrays, dropping junk entries", () => {
    expect(normalizeFilterOverride(["c1", 7, "", null, "c2"])).toEqual(["c1", "c2"]);
  });
  it("decodes non-arrays to null (role default)", () => {
    for (const raw of [null, undefined, "c1", { cal: [] }, 3]) {
      expect(normalizeFilterOverride(raw)).toBeNull();
    }
  });
});

describe("nameAfterKindChange", () => {
  it("adopts the new kind's default label when the name is still the old default", () => {
    expect(nameAfterKindChange("Month", "month", "agenda")).toBe("Agenda");
    expect(nameAfterKindChange("Week (D)", "weekv2", "month")).toBe("Month");
  });
  it("keeps a custom name", () => {
    expect(nameAfterKindChange("Ops Month", "month", "week")).toBe("Ops Month");
  });
  it("keeps the name when a kind is renamed to its own default label", () => {
    expect(nameAfterKindChange("Agenda", "month", "agenda")).toBe("Agenda");
  });
  it("is a no-op when the kind does not change", () => {
    for (const kind of DASHBOARD_VIEW_KINDS) {
      const custom = `My ${DASHBOARD_VIEW_KIND_LABELS[kind]}`;
      expect(nameAfterKindChange(custom, kind, kind)).toBe(custom);
      expect(nameAfterKindChange(DASHBOARD_VIEW_KIND_LABELS[kind], kind, kind)).toBe(
        DASHBOARD_VIEW_KIND_LABELS[kind],
      );
    }
  });
});

describe("resolveActiveTab", () => {
  it("URL tab id wins when it belongs to the set", () => {
    expect(resolveActiveTab("a2", "a1", tabs)).toBe(agendaB);
  });
  it("legacy kind strings map to the first tab of that kind", () => {
    expect(resolveActiveTab("agenda", null, tabs)).toBe(agendaA);
    expect(resolveActiveTab("week", null, tabs)).toBe(month);
  });
  it("falls back to the remembered tab for unknown/foreign ids", () => {
    for (const candidate of ["nope", "00000000-0000-4000-8000-000000000000"]) {
      expect(resolveActiveTab(candidate, "a1", tabs)).toBe(agendaA);
    }
  });
  it("falls back to the first tab when nothing is remembered", () => {
    expect(resolveActiveTab(undefined, null, tabs)).toBe(month);
    expect(resolveActiveTab("junk", null, tabs)).toBe(month);
  });
  it("drops a remembered tab that is no longer present", () => {
    expect(resolveActiveTab(undefined, "deleted", tabs)).toBe(month);
  });
  it("returns undefined with no tabs", () => {
    expect(resolveActiveTab(undefined, null, [])).toBeUndefined();
  });
});

describe("viewSwitchDirection", () => {
  it("is 1 (enters from the right) when the target sits earlier in the strip", () => {
    expect(viewSwitchDirection("a2", "m", tabs)).toBe(1);
  });

  it("is -1 (enters from the left) when the target sits later in the strip", () => {
    expect(viewSwitchDirection("m", "a2", tabs)).toBe(-1);
  });

  it("is 0 for the same tab", () => {
    expect(viewSwitchDirection("a1", "a1", tabs)).toBe(0);
  });

  it("is 0 when either id is unknown", () => {
    expect(viewSwitchDirection("m", "missing", tabs)).toBe(0);
    expect(viewSwitchDirection("missing", "m", tabs)).toBe(0);
  });
});
