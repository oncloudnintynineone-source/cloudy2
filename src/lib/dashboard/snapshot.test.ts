import { describe, expect, it } from "vitest";

import {
  DASHBOARD_SNAPSHOT_VERSION,
  MAX_SNAPSHOTS_PER_USER,
  REFRESH_NONCE_TTL_MS,
  WARM_SNAPSHOT_FRESH_MS,
  assembleDashboardSnapshot,
  capSnapshotMap,
  dashboardRequestKey,
  dashboardTabFiltersEqual,
  isRefreshNonceFresh,
  isSnapshotRecordUsable,
  isWarmSnapshotFresh,
  patchSnapshotTab,
  requiredMonths,
  selectSnapshotsToEvict,
  snapshotStorageKey,
  tabLoadStates,
  type DashboardSharedConfig,
  type DashboardSnapshotRecord,
  type DashboardTabDelta,
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

  it("reads the whole 6-week grid for Month & Agenda too (its agenda day is in-month)", () => {
    // Month & Agenda is day-anchored: the month is the agenda day's month, so
    // the grid's months already cover the agenda day.
    expect(requiredMonths("dual", "2026-09", "2026-09-12")).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(requiredMonths("dual", "2026-09", "2026-09-30")).toEqual([
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
    expect(requiredMonths("weekgrid", "2026-09", "2026-09-12")).toEqual(["2026-09"]);
    // Mon 2026-08-31 .. Sun 2026-09-06.
    expect(requiredMonths("week", "2026-08", "2026-08-31")).toEqual([
      "2026-08",
      "2026-09",
    ]);
    expect(requiredMonths("weekgrid", "2026-08", "2026-08-31")).toEqual([
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

describe("tabLoadStates", () => {
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

  function keyFor(t: DashboardViewTab): string {
    return dashboardRequestKey({
      viewId: t.id,
      months: requiredMonths(t.kind, "2026-09", "2026-09-12"),
    });
  }

  const monthTab = tab({ id: "tab-a", kind: "month" });
  const agendaTab = tab({ id: "tab-b", kind: "agenda" });
  const base = {
    tabs: [monthTab, agendaTab],
    month: "2026-09",
    date: "2026-09-12",
    activeTabId: null as string | null,
    warmKeys: new Set<string>(),
    loadingKeys: new Set<string>(),
  };

  it("marks a tab fresh when a warm snapshot for its key exists", () => {
    const states = tabLoadStates({ ...base, warmKeys: new Set([keyFor(monthTab)]) });
    expect(states["tab-a"]).toBe("fresh");
    expect(states["tab-b"]).toBe("not-loaded");
  });

  it("marks a tab not-loaded when it has no warm copy", () => {
    const states = tabLoadStates(base);
    expect(states["tab-a"]).toBe("not-loaded");
    expect(states["tab-b"]).toBe("not-loaded");
  });

  it("marks a tab loading while a read for its key is in flight", () => {
    const states = tabLoadStates({ ...base, loadingKeys: new Set([keyFor(agendaTab)]) });
    expect(states["tab-a"]).toBe("not-loaded");
    expect(states["tab-b"]).toBe("loading");
  });

  it("lets loading win over a warm copy", () => {
    const states = tabLoadStates({
      ...base,
      warmKeys: new Set([keyFor(monthTab)]),
      loadingKeys: new Set([keyFor(monthTab)]),
    });
    expect(states["tab-a"]).toBe("loading");
  });

  it("keeps the active tab fresh even when it has no warm copy", () => {
    const states = tabLoadStates({ ...base, activeTabId: "tab-a" });
    expect(states["tab-a"]).toBe("fresh");
    expect(states["tab-b"]).toBe("not-loaded");
  });

  it("still shows the active tab loading when a read is in flight", () => {
    const states = tabLoadStates({
      ...base,
      activeTabId: "tab-a",
      loadingKeys: new Set([keyFor(monthTab)]),
    });
    expect(states["tab-a"]).toBe("loading");
  });

  it("resolves each tab independently", () => {
    const states = tabLoadStates({
      ...base,
      warmKeys: new Set([keyFor(monthTab)]),
      loadingKeys: new Set([keyFor(agendaTab)]),
    });
    expect(states).toEqual({ "tab-a": "fresh", "tab-b": "loading" });
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

describe("snapshotStorageKey", () => {
  it("namespaces the request key by account", () => {
    expect(snapshotStorageKey("user-1", "tab-a|2026-09")).toBe("user-1::tab-a|2026-09");
  });
});

describe("isWarmSnapshotFresh", () => {
  const now = 1_700_000_000_000;

  it("is fresh inside the window and stale outside it", () => {
    expect(isWarmSnapshotFresh(now - 1_000, now)).toBe(true);
    expect(isWarmSnapshotFresh(now - WARM_SNAPSHOT_FRESH_MS - 1, now)).toBe(false);
  });
});

describe("assembleDashboardSnapshot", () => {
  const tab: DashboardViewTab = {
    id: "tab-1",
    kind: "month",
    name: "Month",
    sortOrder: 0,
    filters: { cal: null, users: null, types: null },
  };

  it("recombines the shared config with one tab's delta", () => {
    const shared = {
      tabs: [tab],
      canManageViews: true,
      currentUser: "user-1",
    } as unknown as DashboardSharedConfig;
    const delta = {
      activeView: tab,
      events: [],
      selectedCalendarIds: ["cal-a"],
      selectedTypes: [],
      selectedUserIds: ["user-1"],
      viewEventTitleRecipe: { segments: [] } as unknown as DashboardTabDelta["viewEventTitleRecipe"],
      scheduleUsers: [],
      filterUsers: [],
    } as unknown as DashboardTabDelta;

    const snapshot = assembleDashboardSnapshot(shared, delta);
    expect(snapshot.activeView).toBe(tab);
    expect(snapshot.selectedCalendarIds).toEqual(["cal-a"]);
    expect(snapshot.selectedUserIds).toEqual(["user-1"]);
    expect(snapshot.canManageViews).toBe(true);
    expect(snapshot.currentUser).toBe("user-1");
  });
});

describe("patchSnapshotTab", () => {
  const tab = (over: Partial<DashboardViewTab> = {}): DashboardViewTab => ({
    id: "tab-1",
    kind: "month",
    name: "Month",
    sortOrder: 0,
    filters: { cal: null, users: null, types: null },
    ...over,
  });

  function recordFor(active: DashboardViewTab, tabs: DashboardViewTab[]): DashboardSnapshotRecord {
    return {
      version: DASHBOARD_SNAPSHOT_VERSION,
      savedAt: 1_700_000_000_000,
      context: { month: "2026-09", date: "2026-09-12", viewId: active.id, requestKey: "tab-1|2026-09" },
      data: { activeView: active, tabs } as unknown as DashboardSnapshotRecord["data"],
    };
  }

  it("replaces an inactive tab's definition", () => {
    const active = tab({ id: "tab-a", name: "A" });
    const other = tab({ id: "tab-b", name: "B" });
    const patched = patchSnapshotTab(recordFor(active, [active, other]), tab({ id: "tab-b", name: "Renamed" }));
    expect(patched.data.tabs.map((t) => t.name)).toEqual(["A", "Renamed"]);
    expect(patched.data.activeView.name).toBe("A");
  });

  it("patches the active view too when its id matches", () => {
    const active = tab({ id: "tab-a", kind: "month", name: "Month" });
    const patched = patchSnapshotTab(
      recordFor(active, [active]),
      tab({ id: "tab-a", kind: "weekv2", name: "Week (D)" }),
    );
    expect(patched.data.activeView.kind).toBe("weekv2");
    expect(patched.data.activeView.name).toBe("Week (D)");
  });

  it("returns the record unchanged for an unknown tab", () => {
    const active = tab({ id: "tab-a" });
    const record = recordFor(active, [active]);
    expect(patchSnapshotTab(record, tab({ id: "tab-missing" }))).toBe(record);
  });
});

describe("selectSnapshotsToEvict", () => {
  const entry = (key: string, savedAt: number) => ({ key, savedAt });

  it("returns nothing while at or under the cap", () => {
    expect(
      selectSnapshotsToEvict([entry("u::a", 1), entry("u::b", 2)], "u", 2),
    ).toEqual([]);
  });

  it("evicts the oldest beyond the cap, ignoring other accounts", () => {
    expect(
      selectSnapshotsToEvict(
        [
          entry("u::a", 30),
          entry("u::b", 10),
          entry("u::c", 20),
          entry("other::x", 1),
        ],
        "u",
        2,
      ),
    ).toEqual(["u::b"]);
  });

  it("uses MAX_SNAPSHOTS_PER_USER as the default cap", () => {
    const entries = Array.from({ length: MAX_SNAPSHOTS_PER_USER + 2 }, (_, i) =>
      entry(`u::${i}`, i),
    );
    expect(selectSnapshotsToEvict(entries, "u")).toEqual(["u::0", "u::1"]);
  });
});

describe("capSnapshotMap", () => {
  it("returns the map untouched while at or under the cap", () => {
    const map = new Map([
      ["a", record({ savedAt: 1 })],
      ["b", record({ savedAt: 2 })],
    ]);
    expect(capSnapshotMap(map, 2)).toBe(map);
  });

  it("keeps the newest entries beyond the cap", () => {
    const map = new Map([
      ["old", record({ savedAt: 10 })],
      ["mid", record({ savedAt: 20 })],
      ["new", record({ savedAt: 30 })],
    ]);
    expect([...capSnapshotMap(map, 2).keys()]).toEqual(["mid", "new"]);
  });

  it("uses MAX_SNAPSHOTS_PER_USER as the default cap", () => {
    const map = new Map(
      Array.from({ length: MAX_SNAPSHOTS_PER_USER + 2 }, (_, i) => [`k${i}`, record({ savedAt: i })]),
    );
    const capped = capSnapshotMap(map);
    expect(capped.size).toBe(MAX_SNAPSHOTS_PER_USER);
    expect(capped.has("k0")).toBe(false);
    expect(capped.has(`k${MAX_SNAPSHOTS_PER_USER + 1}`)).toBe(true);
  });
});
