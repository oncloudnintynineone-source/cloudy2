import { describe, expect, it } from "vitest";

import {
  DASHBOARD_SNAPSHOT_VERSION,
  REFRESH_NONCE_TTL_MS,
  dashboardCandidateRequestKey,
  dashboardRequestKey,
  isRefreshNonceFresh,
  isSnapshotRecordUsable,
  requiredMonths,
  type DashboardSnapshotRecord,
} from "./snapshot";
import type { DashboardViewTab } from "@/lib/dashboardViews/views";

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
