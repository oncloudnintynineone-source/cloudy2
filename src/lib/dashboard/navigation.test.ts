import { describe, expect, it } from "vitest";

import {
  candidateKeyForUrl,
  classifyDashboardFetch,
  gridMonthsCovered,
  pickColdPaintRecord,
  planDashboardSwitch,
  PREVIEW_STALL_MS,
  previewRevertDelayMs,
  resolveDashboardNavigation,
  type DashboardNavigationInput,
} from "./navigation";
import { DASHBOARD_SNAPSHOT_VERSION, dashboardRequestKey, requiredMonths } from "./snapshot";
import type { DashboardSnapshotRecord } from "./snapshot";
import type { DashboardViewTab } from "@/lib/dashboardViews/views";

function tab(over: Partial<DashboardViewTab> = {}): DashboardViewTab {
  return {
    id: "tab-a",
    kind: "month",
    name: "A",
    sortOrder: 0,
    filters: { cal: null, users: null, types: null },
    ...over,
  };
}

function recordFor(
  active: DashboardViewTab,
  tabs: DashboardViewTab[],
  context: { month: string; date: string } = { month: "2026-09", date: "2026-09-12" },
): DashboardSnapshotRecord {
  return {
    version: DASHBOARD_SNAPSHOT_VERSION,
    savedAt: 1_700_000_000_000,
    context: {
      month: context.month,
      date: context.date,
      viewId: active.id,
      requestKey: dashboardRequestKey({
        viewId: active.id,
        months: requiredMonths(active.kind, context.month, context.date),
      }),
    },
    data: { activeView: active, tabs } as unknown as DashboardSnapshotRecord["data"],
  };
}

function navInput(over: Partial<DashboardNavigationInput> = {}): DashboardNavigationInput {
  return {
    record: null,
    warmRecords: new Map(),
    previewView: null,
    url: { view: null, month: null, date: null },
    failedKey: null,
    ...over,
  };
}

const RELOAD_STUB = {
  activeView: { id: "x", kind: "month" as const },
  tabs: [] as { id: string }[],
};

describe("candidateKeyForUrl", () => {
  const record = recordFor(tab({ id: "tab-1", kind: "schedule" }), []);

  it("returns null before the first record is available", () => {
    expect(candidateKeyForUrl(null, { view: null, month: null, date: null })).toBeNull();
  });

  it("is stable across an in-month day move", () => {
    expect(candidateKeyForUrl(record, { view: null, month: null, date: "2026-09-01" })).toBe(
      candidateKeyForUrl(record, { view: null, month: null, date: "2026-09-30" }),
    );
  });

  it("prefers the ?date= month over ?month= (mirrors the server)", () => {
    expect(candidateKeyForUrl(record, { view: null, month: "2026-10", date: "2026-09-15" })).toBe(
      "tab-1|2026-09",
    );
  });

  it("uses ?month= when no ?date= is present", () => {
    expect(candidateKeyForUrl(record, { view: null, month: "2026-10", date: null })).toBe(
      "tab-1|2026-10",
    );
  });
});

describe("previewRevertDelayMs", () => {
  it("keeps the preview while a router transition is pending", () => {
    expect(
      previewRevertDelayMs({
        previewView: "tab-b",
        urlView: "tab-a",
        navigationPending: true,
      }),
    ).toBe(PREVIEW_STALL_MS);
  });

  it("reverts immediately when navigation has ended and the URL still mismatches", () => {
    expect(
      previewRevertDelayMs({
        previewView: "tab-b",
        urlView: "tab-a",
        navigationPending: false,
      }),
    ).toBe(0);
  });

  it("does not revert when the URL already matches the preview", () => {
    expect(
      previewRevertDelayMs({
        previewView: "tab-b",
        urlView: "tab-b",
        navigationPending: true,
      }),
    ).toBeNull();
  });
});

describe("planDashboardSwitch", () => {
  const base = { shownDate: "2026-09-12", today: "2026-09-13" };

  it("Month → Month keeps the shown month (no date reset)", () => {
    expect(
      planDashboardSwitch({ id: "m2", kind: "month" }, { ...base, view: "month" }, RELOAD_STUB)
        .updates,
    ).toEqual({ view: "m2" });
  });

  it("anchored → Month carries the anchor month and clears the day", () => {
    expect(
      planDashboardSwitch({ id: "m2", kind: "month" }, { ...base, view: "agenda" }, RELOAD_STUB)
        .updates,
    ).toEqual({ view: "m2", month: "2026-09", date: null });
  });

  it("Month → anchored starts on today", () => {
    expect(
      planDashboardSwitch({ id: "d2", kind: "schedule" }, { ...base, view: "month" }, RELOAD_STUB)
        .updates,
    ).toEqual({ view: "d2", date: "2026-09-13", month: null });
  });

  it("anchored → a different anchored kind keeps the anchor day", () => {
    expect(
      planDashboardSwitch({ id: "w2", kind: "week" }, { ...base, view: "agenda" }, RELOAD_STUB)
        .updates,
    ).toEqual({ view: "w2", date: "2026-09-12", month: null });
  });

  it("same kind keeps the current period (just the view change)", () => {
    expect(
      planDashboardSwitch(
        { id: "d2", kind: "schedule" },
        { ...base, view: "schedule" },
        RELOAD_STUB,
      ).updates,
    ).toEqual({ view: "d2" });
  });

  // Month & Agenda is a day-anchored kind (its Month pane follows the agenda
  // day's month), so it rides the anchored branches above.
  it("Month → Month & Agenda starts on today", () => {
    expect(
      planDashboardSwitch({ id: "dp", kind: "dual" }, { ...base, view: "month" }, RELOAD_STUB)
        .updates,
    ).toEqual({ view: "dp", date: "2026-09-13", month: null });
  });

  it("anchored → Month & Agenda keeps the anchor day", () => {
    expect(
      planDashboardSwitch({ id: "dp", kind: "dual" }, { ...base, view: "agenda" }, RELOAD_STUB)
        .updates,
    ).toEqual({ view: "dp", date: "2026-09-12", month: null });
  });

  it("Month & Agenda → Month carries the anchor month and clears the day", () => {
    expect(
      planDashboardSwitch({ id: "m2", kind: "month" }, { ...base, view: "dual" }, RELOAD_STUB)
        .updates,
    ).toEqual({ view: "m2", month: "2026-09", date: null });
  });

  it("Month & Agenda → a different anchored kind keeps the anchor day", () => {
    expect(
      planDashboardSwitch({ id: "w2", kind: "week" }, { ...base, view: "dual" }, RELOAD_STUB)
        .updates,
    ).toEqual({ view: "w2", date: "2026-09-12", month: null });
  });

  it("Month & Agenda → Month & Agenda keeps the current period", () => {
    expect(
      planDashboardSwitch({ id: "dp2", kind: "dual" }, { ...base, view: "dual" }, RELOAD_STUB)
        .updates,
    ).toEqual({ view: "dp2" });
  });

  const monthTab = tab({ id: "m", kind: "month" });
  const agendaA = tab({ id: "a1", kind: "agenda" });
  const agendaB = tab({ id: "a2", kind: "agenda" });
  const tabs = [monthTab, agendaA, agendaB];
  const context = { view: "month" as const, shownDate: "2026-09-12", today: "2026-09-13" };

  it("needsReload: forces a read for an explicit force (CRUD navigation)", () => {
    expect(
      planDashboardSwitch(agendaA, context, { activeView: monthTab, tabs, force: true })
        .needsReload,
    ).toBe(true);
  });

  it("needsReload: forces a read for an unknown id (a freshly created view)", () => {
    expect(
      planDashboardSwitch({ id: "new", kind: "month" }, context, { activeView: monthTab, tabs })
        .needsReload,
    ).toBe(true);
  });

  it("needsReload: forces a read for the active tab under a changed kind", () => {
    expect(
      planDashboardSwitch({ id: monthTab.id, kind: "agenda" }, context, {
        activeView: monthTab,
        tabs,
      }).needsReload,
    ).toBe(true);
  });

  it("needsReload: leaves a known cross-kind switch to the warm cache", () => {
    expect(planDashboardSwitch(agendaA, context, { activeView: monthTab, tabs }).needsReload).toBe(
      false,
    );
  });

  it("needsReload: leaves a known same-kind switch to the warm cache", () => {
    expect(planDashboardSwitch(agendaB, context, { activeView: agendaA, tabs }).needsReload).toBe(
      false,
    );
  });
});

describe("resolveDashboardNavigation", () => {
  it("is empty before the first record", () => {
    const nav = resolveDashboardNavigation(navInput());
    expect(nav.candidateKey).toBeNull();
    expect(nav.displayRecord).toBeNull();
    expect(nav.activeView).toBeUndefined();
    expect(nav.covered).toBe(false);
    expect(nav.isNavigating).toBe(false);
  });

  it("is covered and idle for the held context", () => {
    const a = tab({ id: "tab-a" });
    const nav = resolveDashboardNavigation(
      navInput({
        record: recordFor(a, [a, tab({ id: "tab-b" })]),
        url: { view: "tab-a", month: null, date: null },
      }),
    );
    expect(nav.activeView?.id).toBe("tab-a");
    expect(nav.covered).toBe(true);
    expect(nav.isNavigating).toBe(false);
    expect(nav.month).toBe("2026-09");
    expect(nav.date).toBe("2026-09-12");
  });

  it("resolves the URL day ahead of the held context day", () => {
    const a = tab({ id: "tab-a", kind: "schedule" });
    const nav = resolveDashboardNavigation(
      navInput({
        record: recordFor(a, [a]),
        url: { view: "tab-a", month: null, date: "2026-09-30" },
      }),
    );
    expect(nav.date).toBe("2026-09-30");
  });

  it("switches to an equivalent tab without navigating", () => {
    const a = tab({ id: "tab-a", name: "A" });
    const b = tab({ id: "tab-b", name: "B" });
    const nav = resolveDashboardNavigation(
      navInput({ record: recordFor(a, [a, b]), url: { view: "tab-b", month: null, date: null } }),
    );
    expect(nav.activeView?.id).toBe("tab-b");
    expect(nav.covered).toBe(true);
    expect(nav.isNavigating).toBe(false);
  });

  it("is URL-first and navigating for a different-kind tab", () => {
    const a = tab({ id: "tab-a" });
    const b = tab({ id: "tab-b", kind: "agenda" });
    const nav = resolveDashboardNavigation(
      navInput({ record: recordFor(a, [a, b]), url: { view: "tab-b", month: null, date: null } }),
    );
    expect(nav.activeView?.id).toBe("tab-b");
    expect(nav.covered).toBe(false);
    expect(nav.isNavigating).toBe(true);
  });

  it("paints a warm candidate without reading or navigating", () => {
    const held = tab({ id: "tab-a", kind: "month" });
    const target = tab({ id: "tab-b", kind: "agenda" });
    const record = recordFor(held, [held, target]);
    const warm = recordFor(target, [held, target]);
    const key = candidateKeyForUrl(record, { view: "tab-b", month: null, date: null });
    const nav = resolveDashboardNavigation(
      navInput({
        record,
        warmRecords: new Map([[key as string, warm]]),
        url: { view: "tab-b", month: null, date: null },
      }),
    );
    expect(nav.displayRecord).toBe(warm);
    expect(nav.activeView?.id).toBe("tab-b");
    expect(nav.isNavigating).toBe(false);
  });

  it("heals to the held tab after a failed fetch for the context", () => {
    const a = tab({ id: "tab-a" });
    const b = tab({ id: "tab-b", kind: "agenda" });
    const record = recordFor(a, [a, b]);
    const failedKey = candidateKeyForUrl(record, { view: "tab-b", month: null, date: null });
    const nav = resolveDashboardNavigation(
      navInput({
        record,
        url: { view: "tab-b", month: null, date: null },
        failedKey,
      }),
    );
    expect(nav.activeView?.id).toBe("tab-a");
    expect(nav.isNavigating).toBe(false);
  });
});

describe("classifyDashboardFetch", () => {
  const base = {
    record: null,
    warmRecords: new Map<string, DashboardSnapshotRecord>(),
    url: { view: null, month: null, date: null },
    previewPending: false,
    hasFresh: false,
    busy: false,
    now: 0,
  };

  it("skips the held context (same request key)", () => {
    const a = tab({ id: "tab-a" });
    const action = classifyDashboardFetch({
      ...base,
      record: recordFor(a, [a]),
      url: { view: "tab-a", month: null, date: null },
      hasFresh: true,
    });
    expect(action.kind).toBe("skip");
  });

  it("swaps a data-equivalent tab locally on fresh, idle data", () => {
    const a = tab({ id: "tab-a", name: "A" });
    const b = tab({ id: "tab-b", name: "B" });
    const record = recordFor(a, [a, b]);
    const action = classifyDashboardFetch({
      ...base,
      record,
      url: { view: "tab-b", month: null, date: null },
      hasFresh: true,
    });
    expect(action.kind).toBe("swap");
    if (action.kind === "swap") {
      expect(action.record.data.activeView.id).toBe("tab-b");
      expect(action.key).toBe(
        candidateKeyForUrl(record, { view: "tab-b", month: null, date: null }),
      );
    }
  });

  it("does not swap while a read is in flight (busy)", () => {
    const a = tab({ id: "tab-a", name: "A" });
    const b = tab({ id: "tab-b", name: "B" });
    const action = classifyDashboardFetch({
      ...base,
      record: recordFor(a, [a, b]),
      url: { view: "tab-b", month: null, date: null },
      hasFresh: true,
      busy: true,
    });
    expect(action.kind).toBe("fetch");
  });

  it("skips a fresh warm candidate for a different-kind tab", () => {
    const held = tab({ id: "tab-a", kind: "month" });
    const target = tab({ id: "tab-b", kind: "agenda" });
    const record = recordFor(held, [held, target]);
    const warm = recordFor(target, [held, target]);
    const key = candidateKeyForUrl(record, { view: "tab-b", month: null, date: null });
    const action = classifyDashboardFetch({
      ...base,
      record,
      warmRecords: new Map([[key as string, warm]]),
      url: { view: "tab-b", month: null, date: null },
      hasFresh: true,
      now: warm.savedAt,
    });
    expect(action.kind).toBe("skip");
  });

  it("uses the warm candidate for a deep link (target resolves separately)", () => {
    const held = tab({ id: "tab-a", kind: "month" });
    const target = tab({ id: "tab-b", kind: "agenda" });
    const record = recordFor(held, [held, target]);
    const warm = recordFor(target, [held, target]);
    const key = candidateKeyForUrl(record, { view: "tab-b", month: null, date: null });
    const action = classifyDashboardFetch({
      ...base,
      record,
      warmRecords: new Map([[key as string, warm]]),
      url: { view: "tab-b", month: null, date: null },
      hasFresh: true,
      now: warm.savedAt,
    });
    expect(action.kind).toBe("skip");
  });

  it("skips while an un-warm preview tab is pending", () => {
    const held = tab({ id: "tab-a", kind: "month" });
    const target = tab({ id: "tab-b", kind: "agenda" });
    const action = classifyDashboardFetch({
      ...base,
      record: recordFor(held, [held, target]),
      url: { view: "tab-b", month: null, date: null },
      hasFresh: true,
      previewPending: true,
    });
    expect(action.kind).toBe("skip");
  });

  it("fetches when nothing is held", () => {
    expect(classifyDashboardFetch(base).kind).toBe("fetch");
  });
});

describe("gridMonthsCovered", () => {
  it("a month always covers its own grid", () => {
    expect(gridMonthsCovered("2026-10", "2026-10", "monday")).toBe(true);
    expect(gridMonthsCovered("2026-10", "2026-10", "sunday")).toBe(true);
  });

  it("Apr 2026's grid already spans into May, so it covers the May grid", () => {
    // Apr grid: Mar 30 - May 3 -> {03, 04, 05}; May grid: Apr 27 - May 31 -> {04, 05}.
    expect(gridMonthsCovered("2026-04", "2026-05", "monday")).toBe(true);
  });

  it("Oct 2026's grid does not cover Nov's, which needs Dec 1", () => {
    // Oct grid: Sep 28 - Nov 1 -> {09, 10, 11}; Nov grid: Oct 26 - Dec 1 -> {10, 11, 12}.
    expect(gridMonthsCovered("2026-10", "2026-11", "monday")).toBe(false);
  });

  it("the backward step is not covered either", () => {
    // Dec grid: Nov 30 - Jan 4 -> {11, 12, 01}; Nov grid needs Oct 26.
    expect(gridMonthsCovered("2026-12", "2026-11", "monday")).toBe(false);
  });

  it("honours the account's week start", () => {
    // Sunday-start Oct 2026 grid: Sep 27 - Oct 31 -> {09, 10}; Nov grid: Nov 1 - Dec 5 -> {11, 12}.
    expect(gridMonthsCovered("2026-10", "2026-11", "sunday")).toBe(false);
    expect(gridMonthsCovered("2026-11", "2026-10", "sunday")).toBe(false);
  });
});

describe("pickColdPaintRecord", () => {
  const monthTab = tab({ id: "tab-a", name: "A" });
  const agendaTab = tab({ id: "tab-b", kind: "agenda", name: "B" });
  const tabs = [monthTab, agendaTab];
  const anchor = (active: DashboardViewTab, month: string, savedAt: number) => ({
    ...recordFor(active, tabs, { month, date: `${month}-12` }),
    savedAt,
  });
  const silent = { urlView: null, urlMonth: null, urlDate: null };

  it("paints the remembered anchor month, not the newer preload anchors", () => {
    // The preload batch (current + next two months) is written after the viewed
    // month, so "newest" alone lands two months ahead.
    const cached = [
      anchor(monthTab, "2026-10", 100),
      anchor(monthTab, "2026-11", 200),
      anchor(monthTab, "2026-12", 200),
    ];
    const paint = pickColdPaintRecord(cached, { ...silent, rememberedMonth: "2026-10" });
    expect(paint?.context.month).toBe("2026-10");
  });

  it("uses the URL month over the remembered one", () => {
    const cached = [anchor(monthTab, "2026-10", 100), anchor(monthTab, "2026-11", 200)];
    const paint = pickColdPaintRecord(cached, {
      ...silent,
      urlMonth: "2026-11",
      rememberedMonth: "2026-10",
    });
    expect(paint?.context.month).toBe("2026-11");
  });

  it("derives the anchor month from a URL date", () => {
    const cached = [anchor(monthTab, "2026-10", 100), anchor(monthTab, "2026-12", 200)];
    const paint = pickColdPaintRecord(cached, {
      ...silent,
      urlDate: "2026-10-31",
      rememberedMonth: null,
    });
    expect(paint?.context.month).toBe("2026-10");
  });

  it("paints nothing when the anchor has no cached context", () => {
    const cached = [anchor(monthTab, "2026-11", 200), anchor(monthTab, "2026-12", 200)];
    expect(pickColdPaintRecord(cached, { ...silent, rememberedMonth: "2026-10" })).toBeNull();
  });

  it("falls back to the newest record when nothing is remembered", () => {
    const cached = [anchor(monthTab, "2026-10", 100), anchor(monthTab, "2026-12", 200)];
    const paint = pickColdPaintRecord(cached, { ...silent, rememberedMonth: null });
    expect(paint?.context.month).toBe("2026-12");
  });

  it("never resurrects the last-viewed tab when the URL is silent", () => {
    const cached = [anchor(monthTab, "2026-10", 100), anchor(agendaTab, "2026-10", 300)];
    const paint = pickColdPaintRecord(cached, { ...silent, rememberedMonth: "2026-10" });
    expect(paint?.data.activeView.id).toBe("tab-a");
  });

  it("honours a URL view even without a month", () => {
    const cached = [anchor(monthTab, "2026-10", 100), anchor(agendaTab, "2026-10", 200)];
    const paint = pickColdPaintRecord(cached, {
      urlView: "tab-b",
      urlMonth: null,
      urlDate: null,
      rememberedMonth: "2026-10",
    });
    expect(paint?.data.activeView.id).toBe("tab-b");
  });

  it("returns null for an empty cache", () => {
    expect(pickColdPaintRecord([], { ...silent, rememberedMonth: "2026-10" })).toBeNull();
  });
});
