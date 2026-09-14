import { describe, expect, it } from "vitest";

import {
  DASHBOARD_VIEW_KINDS,
  DASHBOARD_VIEW_KIND_LABELS,
  isDashboardViewKind,
  nameAfterKindChange,
  normalizeFilterOverride,
  periodSwitchDirection,
  resolveActiveTab,
  sanitizeDashboardViewName,
  tabSwitchNeedsReload,
  tabSwitchTarget,
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
  it("accepts every renderer kind", () => {
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
    expect(nameAfterKindChange("Month", "month", "dual")).toBe("Month & Agenda");
    expect(nameAfterKindChange("Month & Agenda", "dual", "agenda")).toBe("Agenda");
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
  it("is -1 (enters from the left) when the target sits earlier in the strip", () => {
    expect(viewSwitchDirection("a2", "m", tabs)).toBe(-1);
  });

  it("is 1 (enters from the right) when the target sits later in the strip", () => {
    expect(viewSwitchDirection("m", "a2", tabs)).toBe(1);
  });

  it("is 0 for the same tab", () => {
    expect(viewSwitchDirection("a1", "a1", tabs)).toBe(0);
  });

  it("is 0 when either id is unknown", () => {
    expect(viewSwitchDirection("m", "missing", tabs)).toBe(0);
    expect(viewSwitchDirection("missing", "m", tabs)).toBe(0);
  });
});

describe("periodSwitchDirection", () => {
  it("is 1 (enters from the right) moving forward in time", () => {
    expect(periodSwitchDirection("2026-09", "2026-10")).toBe(1);
    expect(periodSwitchDirection("2026-09-04", "2026-09-05")).toBe(1);
    expect(periodSwitchDirection("2026-09-30", "2026-10-01")).toBe(1);
  });

  it("is -1 (enters from the left) moving backward in time", () => {
    expect(periodSwitchDirection("2026-10", "2026-09")).toBe(-1);
    expect(periodSwitchDirection("2026-09-05", "2026-09-04")).toBe(-1);
  });

  it("is 0 without both keys or on an unchanged period", () => {
    expect(periodSwitchDirection(null, "2026-09")).toBe(0);
    expect(periodSwitchDirection("2026-09", null)).toBe(0);
    expect(periodSwitchDirection(null, null)).toBe(0);
    expect(periodSwitchDirection("2026-09", "2026-09")).toBe(0);
  });
});

describe("tabSwitchTarget", () => {
  const base = { shownDate: "2026-09-12", today: "2026-09-13" };

  it("Month → Month keeps the shown month (no date reset)", () => {
    expect(tabSwitchTarget({ id: "m2", kind: "month" }, { ...base, view: "month" })).toEqual({
      view: "m2",
    });
  });

  it("anchored → Month carries the anchor month and clears the day", () => {
    expect(tabSwitchTarget({ id: "m2", kind: "month" }, { ...base, view: "agenda" })).toEqual({
      view: "m2",
      month: "2026-09",
      date: null,
    });
  });

  it("Month → anchored starts on today", () => {
    expect(tabSwitchTarget({ id: "d2", kind: "schedule" }, { ...base, view: "month" })).toEqual({
      view: "d2",
      date: "2026-09-13",
      month: null,
    });
  });

  it("anchored → a different anchored kind keeps the anchor day", () => {
    expect(tabSwitchTarget({ id: "w2", kind: "week" }, { ...base, view: "agenda" })).toEqual({
      view: "w2",
      date: "2026-09-12",
      month: null,
    });
  });

  it("same kind keeps the current period (just the view change)", () => {
    expect(tabSwitchTarget({ id: "d2", kind: "schedule" }, { ...base, view: "schedule" })).toEqual({
      view: "d2",
    });
  });

  // Month & Agenda is a day-anchored kind (its Month pane follows the agenda
  // day's month), so it rides the anchored branches above.
  it("Month → Month & Agenda starts on today", () => {
    expect(tabSwitchTarget({ id: "dp", kind: "dual" }, { ...base, view: "month" })).toEqual({
      view: "dp",
      date: "2026-09-13",
      month: null,
    });
  });

  it("anchored → Month & Agenda keeps the anchor day", () => {
    expect(tabSwitchTarget({ id: "dp", kind: "dual" }, { ...base, view: "agenda" })).toEqual({
      view: "dp",
      date: "2026-09-12",
      month: null,
    });
  });

  it("Month & Agenda → Month carries the anchor month and clears the day", () => {
    expect(tabSwitchTarget({ id: "m2", kind: "month" }, { ...base, view: "dual" })).toEqual({
      view: "m2",
      month: "2026-09",
      date: null,
    });
  });

  it("Month & Agenda → a different anchored kind keeps the anchor day", () => {
    expect(tabSwitchTarget({ id: "w2", kind: "week" }, { ...base, view: "dual" })).toEqual({
      view: "w2",
      date: "2026-09-12",
      month: null,
    });
  });

  it("Month & Agenda → Month & Agenda keeps the current period", () => {
    expect(tabSwitchTarget({ id: "dp2", kind: "dual" }, { ...base, view: "dual" })).toEqual({
      view: "dp2",
    });
  });
});

describe("tabSwitchNeedsReload", () => {
  it("forces a read for an explicit force (CRUD navigation)", () => {
    expect(
      tabSwitchNeedsReload({ target: agendaA, activeView: month, tabs, force: true }),
    ).toBe(true);
  });

  it("forces a read for an unknown id (a freshly created view)", () => {
    expect(
      tabSwitchNeedsReload({
        target: { id: "new", kind: "month" },
        activeView: month,
        tabs,
      }),
    ).toBe(true);
  });

  it("forces a read for the active tab under a changed kind", () => {
    expect(
      tabSwitchNeedsReload({
        target: { id: month.id, kind: "agenda" },
        activeView: month,
        tabs,
      }),
    ).toBe(true);
  });

  it("leaves a known cross-kind switch to the warm cache", () => {
    expect(
      tabSwitchNeedsReload({ target: agendaA, activeView: month, tabs }),
    ).toBe(false);
  });

  it("leaves a known same-kind switch to the warm cache", () => {
    expect(
      tabSwitchNeedsReload({ target: agendaB, activeView: agendaA, tabs }),
    ).toBe(false);
  });
});
