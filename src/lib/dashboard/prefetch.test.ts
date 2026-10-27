import { describe, expect, it } from "vitest";

import { dashboardBootSignature, prefetchTargetForPeriod, prefetchTargetForTab } from "./prefetch";

describe("prefetchTargetForPeriod", () => {
  it("steps a month anchor by whole months", () => {
    expect(
      prefetchTargetForPeriod({ kind: "month", month: "2026-01", date: "2026-01-15" }, 1),
    ).toEqual({ month: "2026-02", date: null });
    expect(
      prefetchTargetForPeriod({ kind: "month", month: "2026-01", date: "2026-01-15" }, -1),
    ).toEqual({ month: "2025-12", date: null });
  });

  it("steps an anchored dual pane month and clamps the day", () => {
    expect(
      prefetchTargetForPeriod({ kind: "dual", month: "2026-01", date: "2026-01-31" }, 1),
    ).toEqual({ month: "2026-02", date: "2026-02-28" });
  });

  it("steps week and day kinds by their own unit", () => {
    expect(
      prefetchTargetForPeriod({ kind: "week", month: "2026-01", date: "2026-01-28" }, 1),
    ).toEqual({ month: "2026-02", date: "2026-02-04" });
    expect(
      prefetchTargetForPeriod({ kind: "schedule", month: "2026-01", date: "2026-01-31" }, 1),
    ).toEqual({ month: "2026-02", date: "2026-02-01" });
    expect(
      prefetchTargetForPeriod({ kind: "agenda", month: "2026-01", date: "2026-01-01" }, -1),
    ).toEqual({ month: "2025-12", date: "2025-12-31" });
  });
});

describe("prefetchTargetForTab", () => {
  it("uses the tab's planned period when the switch supplies one", () => {
    expect(
      prefetchTargetForTab(
        { id: "v1" },
        { view: "v1", month: "2026-03", date: null },
        {
          month: "2026-01",
          date: "2026-01-15",
        },
      ),
    ).toEqual({ view: "v1", month: "2026-03", date: null });

    expect(
      prefetchTargetForTab(
        { id: "v1" },
        { view: "v1", month: null, date: "2026-04-02" },
        {
          month: "2026-01",
          date: "2026-01-15",
        },
      ),
    ).toEqual({ view: "v1", month: "2026-04", date: "2026-04-02" });
  });

  it("falls back to the current period for a same-kind tab switch", () => {
    expect(
      prefetchTargetForTab(
        { id: "v1" },
        { view: "v1" },
        {
          month: "2026-01",
          date: "2026-01-15",
        },
      ),
    ).toEqual({ view: "v1", month: "2026-01", date: "2026-01-15" });
  });
});

describe("dashboardBootSignature", () => {
  it("is order-stable and distinguishes each data-bearing param", () => {
    const base = { view: "v1", month: "2026-01", date: null, refresh: null };
    expect(dashboardBootSignature(base)).toBe(dashboardBootSignature({ ...base }));
    expect(dashboardBootSignature(base)).not.toBe(
      dashboardBootSignature({ ...base, month: "2026-02" }),
    );
  });
});
