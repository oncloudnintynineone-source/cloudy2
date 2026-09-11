import { describe, expect, it } from "vitest";

import {
  DASHBOARD_SNAPSHOT_VERSION,
  REFRESH_NONCE_TTL_MS,
  dashboardRequestKey,
  isRefreshNonceFresh,
  isSnapshotRecordUsable,
  type DashboardSnapshotRecord,
} from "./snapshot";

function record(overrides: Partial<DashboardSnapshotRecord> = {}): DashboardSnapshotRecord {
  return {
    version: DASHBOARD_SNAPSHOT_VERSION,
    savedAt: 1_700_000_000_000,
    context: { month: "2026-09", date: "2026-09-12", viewId: "tab-1", requestKey: "" },
    data: {} as DashboardSnapshotRecord["data"],
    ...overrides,
  };
}

describe("dashboardRequestKey", () => {
  it("includes the data-bearing params in a stable order", () => {
    expect(dashboardRequestKey({ view: "v1", month: "2026-09", date: "2026-09-12" })).toBe(
      "view=v1&month=2026-09&date=2026-09-12",
    );
  });

  it("omits empty / missing params", () => {
    expect(dashboardRequestKey({ view: null, month: "2026-09", date: "" })).toBe("month=2026-09");
    expect(dashboardRequestKey({})).toBe("");
  });

  it("ignores one-shot params entirely (edit/event/refresh are not inputs)", () => {
    // The function only accepts view/month/date, so the presence of a deep
    // link cannot change the key.
    expect(dashboardRequestKey({ view: null, month: null, date: null })).toBe("");
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
