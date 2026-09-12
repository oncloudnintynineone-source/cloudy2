import { describe, expect, it } from "vitest";

import {
  DASHBOARD_SNAPSHOT_VERSION,
  REFRESH_NONCE_TTL_MS,
  dashboardCandidateRequestKey,
  dashboardRequestKey,
  dashboardTabFiltersEqual,
  equivalentDashboardTab,
  isRefreshNonceFresh,
  isSnapshotRecordUsable,
  requiredMonths,
  resolveDashboardPresentation,
  type DashboardSnapshotRecord,
} from "./snapshot";
import type { DashboardTabFilters, DashboardViewTab } from "@/lib/dashboardViews/views";

function record(overrides: Partial<DashboardSnapshotRecord> = {}): DashboardSnapshotRecord {
  return {
    version: DASHBOARD_SNAPSHOT_VERSION,
    savedAt: 1_700_000_000_000,
    context: { month: "2026-09", date: "2026-09-12", viewId: "tab-1", requestKey: "" },
    data: {} as DashboardSnapshotRecord["data"],
    ...overrides,
  };
}

describe("requiredMonths", () => {
  it("reads the whole 6-week grid for the Month view", () => {
    // 2026-09-01 is a Tuesday, so the Monday-first grid opens on 2026-08-31 and
    // closes six weeks later on 2026-10-11 -> three months.
    expect(requiredMonths("month", "2026-09", "2026-09-12")).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });

  it("reads the single containing month for Day and Agenda", () => {
    expect(requiredMonths("schedule", "2026-09", "2026-09-12")).toEqual(["2026-09"]);
    expect(requiredMonths("agenda", "2026-09", "2026-09-30")).toEqual(["2026-09"]);
  });

  it("reads one month for a week inside a month and two at a boundary", () => {
    // Mon 2026-09-07 .. Sun 2026-09-13.
    expect(requiredMonths("week", "2026-09", "2026-09-12")).toEqual(["2026-09"]);
    expect(requiredMonths("weekv2", "2026-09", "2026-09-12")).toEqual(["2026-09"]);
    // Mon 2026-08-31 .. Sun 2026-09-06.
    expect(requiredMonths("week", "2026-08", "2026-08-31")).toEqual([
      "2026-08",
      "2026-09",
    ]);
  });
});

describe("dashboardRequestKey", () => {
  it("is the resolved tab id plus the sorted, de-duplicated months", () => {
    expect(
      dashboardRequestKey({ viewId: "tab-1", months: ["2026-09", "2026-08", "2026-09"] }),
    ).toBe("tab-1|2026-08,2026-09");
  });

  it("is stable across an in-month day move (no refetch)", () => {
    const key = (date: string) =>
      dashboardRequestKey({
        viewId: "tab-1",
        months: requiredMonths("agenda", "2026-09", date),
      });
    expect(key("2026-09-01")).toBe(key("2026-09-30"));
  });

  it("changes when the required month set changes", () => {
    const monthKey = dashboardRequestKey({
      viewId: "tab-1",
      months: requiredMonths("agenda", "2026-09", "2026-09-30"),
    });
    const nextKey = dashboardRequestKey({
      viewId: "tab-1",
      months: requiredMonths("agenda", "2026-10", "2026-10-01"),
    });
    expect(monthKey).not.toBe(nextKey);
  });

  it("handles an empty month set", () => {
    expect(dashboardRequestKey({ viewId: "default", months: [] })).toBe("default|");
  });
});

describe("dashboardCandidateRequestKey", () => {
  function candidateRecord(): DashboardSnapshotRecord {
    const tab: DashboardViewTab = {
      id: "tab-1",
      kind: "schedule",
      name: "Day",
      sortOrder: 0,
      filters: { cal: null, users: null, types: null },
    };
    return {
      version: DASHBOARD_SNAPSHOT_VERSION,
      savedAt: 1_700_000_000_000,
      context: { month: "2026-09", date: "2026-09-12", viewId: "tab-1", requestKey: "" },
      data: { activeView: tab, tabs: [tab] } as unknown as DashboardSnapshotRecord["data"],
    };
  }

  it("returns null before the first record is available", () => {
    expect(dashboardCandidateRequestKey(null, null, null, null)).toBeNull();
  });

  it("is stable across an in-month day move", () => {
    expect(dashboardCandidateRequestKey(candidateRecord(), null, null, "2026-09-01")).toBe(
      dashboardCandidateRequestKey(candidateRecord(), null, null, "2026-09-30"),
    );
  });

  it("prefers the ?date= month over ?month= (mirrors the server)", () => {
    expect(dashboardCandidateRequestKey(candidateRecord(), null, "2026-10", "2026-09-15")).toBe(
      "tab-1|2026-09",
    );
  });

  it("uses ?month= when no ?date= is present", () => {
    expect(dashboardCandidateRequestKey(candidateRecord(), null, "2026-10", null)).toBe(
      "tab-1|2026-10",
    );
  });
});

describe("dashboardTabFiltersEqual", () => {
  const f = (over: Partial<DashboardTabFilters> = {}): DashboardTabFilters => ({
    cal: null,
    users: null,
    types: null,
    ...over,
  });

  it("treats two role-default (null) tabs as equal", () => {
    expect(dashboardTabFiltersEqual(f(), f())).toBe(true);
  });

  it("distinguishes null (role default) from an explicit empty array", () => {
    expect(dashboardTabFiltersEqual(f({ cal: null }), f({ cal: [] }))).toBe(false);
  });

  it("is order-insensitive", () => {
    expect(dashboardTabFiltersEqual(f({ cal: ["a", "b"] }), f({ cal: ["b", "a"] }))).toBe(true);
  });

  it("detects a differing selection", () => {
    expect(dashboardTabFiltersEqual(f({ cal: ["a"] }), f({ cal: ["a", "b"] }))).toBe(false);
  });
});

describe("equivalentDashboardTab", () => {
  function tab(over: Partial<DashboardViewTab> = {}): DashboardViewTab {
    return {
      id: "tab-1",
      kind: "month",
      name: "Month",
      sortOrder: 0,
      filters: { cal: null, users: null, types: null },
      ...over,
    };
  }

  function twoTabRecord(a: DashboardViewTab, b: DashboardViewTab): DashboardSnapshotRecord {
    return {
      version: DASHBOARD_SNAPSHOT_VERSION,
      savedAt: 1_700_000_000_000,
      context: { month: "2026-09", date: "2026-09-12", viewId: a.id, requestKey: "" },
      data: { activeView: a, tabs: [a, b] } as unknown as DashboardSnapshotRecord["data"],
    };
  }

  it("returns the target for a same-kind, same-filter, same-month tab", () => {
    const a = tab({ id: "tab-a", name: "A" });
    const b = tab({ id: "tab-b", name: "B" });
    expect(equivalentDashboardTab(twoTabRecord(a, b), "tab-b", null, null)?.id).toBe("tab-b");
  });

  it("returns null for the held tab", () => {
    const a = tab({ id: "tab-a" });
    const b = tab({ id: "tab-b" });
    expect(equivalentDashboardTab(twoTabRecord(a, b), "tab-a", null, null)).toBeNull();
  });

  it("returns null when the filters differ", () => {
    const a = tab({ id: "tab-a" });
    const b = tab({ id: "tab-b", filters: { cal: ["dept-1"], users: null, types: null } });
    expect(equivalentDashboardTab(twoTabRecord(a, b), "tab-b", null, null)).toBeNull();
  });

  it("returns null when the kind differs", () => {
    const a = tab({ id: "tab-a", kind: "month" });
    const b = tab({ id: "tab-b", kind: "agenda" });
    expect(equivalentDashboardTab(twoTabRecord(a, b), "tab-b", null, null)).toBeNull();
  });

  it("returns null when the required months differ", () => {
    const a = tab({ id: "tab-a", kind: "month" });
    const b = tab({ id: "tab-b", kind: "month" });
    // Held context is 2026-09; the URL asks for 2026-11 -> different grid months.
    expect(equivalentDashboardTab(twoTabRecord(a, b), "tab-b", "2026-11", null)).toBeNull();
  });
});

describe("resolveDashboardPresentation", () => {
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

  function recordFor(a: DashboardViewTab, b: DashboardViewTab): DashboardSnapshotRecord {
    return {
      version: DASHBOARD_SNAPSHOT_VERSION,
      savedAt: 1_700_000_000_000,
      context: {
        month: "2026-09",
        date: "2026-09-12",
        viewId: a.id,
        requestKey: dashboardRequestKey({
          viewId: a.id,
          months: requiredMonths(a.kind, "2026-09", "2026-09-12"),
        }),
      },
      data: { activeView: a, tabs: [a, b] } as unknown as DashboardSnapshotRecord["data"],
    };
  }

  it("is covered and idle for the held context", () => {
    const a = tab({ id: "tab-a" });
    const p = resolveDashboardPresentation(
      recordFor(a, tab({ id: "tab-b" })),
      "tab-a",
      null,
      null,
      { cached: false, failedKey: null },
    );
    expect(p.activeView.id).toBe("tab-a");
    expect(p.covered).toBe(true);
    expect(p.isNavigating).toBe(false);
  });

  it("switches to an equivalent tab without navigating", () => {
    const a = tab({ id: "tab-a", name: "A" });
    const b = tab({ id: "tab-b", name: "B" });
    const p = resolveDashboardPresentation(recordFor(a, b), "tab-b", null, null, {
      cached: false,
      failedKey: null,
    });
    expect(p.activeView.id).toBe("tab-b");
    expect(p.covered).toBe(true);
    expect(p.isNavigating).toBe(false);
  });

  it("is URL-first and navigating for a different-kind tab", () => {
    const a = tab({ id: "tab-a" });
    const b = tab({ id: "tab-b", kind: "agenda" });
    const p = resolveDashboardPresentation(recordFor(a, b), "tab-b", null, null, {
      cached: false,
      failedKey: null,
    });
    expect(p.activeView.id).toBe("tab-b");
    expect(p.covered).toBe(false);
    expect(p.isNavigating).toBe(true);
  });

  it("keeps the held tab while a cached record paints", () => {
    const a = tab({ id: "tab-a" });
    const b = tab({ id: "tab-b", kind: "agenda" });
    const p = resolveDashboardPresentation(recordFor(a, b), "tab-b", null, null, {
      cached: true,
      failedKey: null,
    });
    expect(p.activeView.id).toBe("tab-a");
    expect(p.isNavigating).toBe(false);
  });

  it("heals to the held tab after a failed fetch for the context", () => {
    const a = tab({ id: "tab-a" });
    const b = tab({ id: "tab-b", kind: "agenda" });
    const record = recordFor(a, b);
    const failedKey = dashboardCandidateRequestKey(record, "tab-b", null, null);
    const p = resolveDashboardPresentation(record, "tab-b", null, null, {
      cached: false,
      failedKey,
    });
    expect(p.activeView.id).toBe("tab-a");
    expect(p.isNavigating).toBe(false);
  });
});

describe("isSnapshotRecordUsable", () => {
  it("accepts a current-version record with a context", () => {
    expect(isSnapshotRecordUsable(record())).toBe(true);
  });

  it("rejects a version mismatch", () => {
    expect(isSnapshotRecordUsable(record({ version: DASHBOARD_SNAPSHOT_VERSION + 1 }))).toBe(false);
  });

  it("rejects null / missing context / missing data", () => {
    expect(isSnapshotRecordUsable(null)).toBe(false);
    expect(isSnapshotRecordUsable(undefined)).toBe(false);
    expect(isSnapshotRecordUsable(record({ data: undefined as never }))).toBe(false);
    expect(
      isSnapshotRecordUsable(
        record({ context: { month: undefined as never, date: "", viewId: "", requestKey: "" } }),
      ),
    ).toBe(false);
  });
});

describe("isRefreshNonceFresh", () => {
  const now = 1_700_000_000_000;

  it("accepts a recent finite nonce", () => {
    expect(isRefreshNonceFresh(String(now - 1_000), now)).toBe(true);
  });

  it("rejects a nonce older than the window", () => {
    expect(isRefreshNonceFresh(String(now - REFRESH_NONCE_TTL_MS - 1), now)).toBe(false);
  });

  it("rejects missing / non-numeric values", () => {
    expect(isRefreshNonceFresh(null, now)).toBe(false);
    expect(isRefreshNonceFresh(undefined, now)).toBe(false);
    expect(isRefreshNonceFresh("", now)).toBe(false);
    expect(isRefreshNonceFresh("not-a-number", now)).toBe(false);
  });
});
